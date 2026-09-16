import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { Badge, Body, Button, CacheNotice, Card, Empty, ErrorBox, Field, Loading, Notice, Row, Screen, Title } from "../../../../../src/components/ui";
import { es, web } from "../../../../../src/i18n/es";
import { fromError } from "../../../../../src/lib/api";
import { pickPhoto, takePhoto, uploadImage, type PickResult } from "../../../../../src/lib/files";
import { dayOf, euros } from "../../../../../src/lib/format";
import { supabase } from "../../../../../src/lib/supabase";
import { useSpace } from "../../../../../src/lib/space-context";
import { useAction } from "../../../../../src/lib/use-action";
import { useLoader } from "../../../../../src/lib/use-loader";

type Billing = {
  canView: boolean;
  charges: { id: string; concept: string; total_cents: number; due_at: string; status: string; outstanding: number }[];
  quotes: { id: string; code: string; concept: string; total_cents: number; state: string; requires_payment_before_start: boolean }[];
};

async function loadBilling(establishmentId: string): Promise<Billing> {
  const { data: canView } = await supabase.rpc("client_can_view_billing", { p_establishment_id: establishmentId });
  if (canView !== true) return { canView: false, charges: [], quotes: [] };
  const [{ data: charges }, { data: quotes }] = await Promise.all([
    supabase.from("charges").select("id, concept, total_cents, due_at").eq("establishment_id", establishmentId).order("due_at", { ascending: false }).limit(40),
    supabase.from("quotes").select("id, code, concept, total_cents, state, requires_payment_before_start").eq("establishment_id", establishmentId).in("state", ["sent"]).order("created_at", { ascending: false }),
  ]);
  const enriched = await Promise.all(
    (charges ?? []).map(async (c) => {
      const [{ data: status }, { data: outstanding }] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: c.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: c.id }),
      ]);
      return { ...c, status: status ?? "pending", outstanding: outstanding ?? 0 };
    }),
  );
  return { canView: true, charges: enriched, quotes: quotes ?? [] };
}

/**
 * §176 · "pagar o confirmar" del restaurante: el justificante de un cobro
 * (`upload_payment_receipt`, foto de cámara o galería, RN-MOV-07) y
 * aceptar un presupuesto (`accept_quote`). Quién ve la facturación lo
 * dice `client_can_view_billing` (RN-FIN-07).
 */
export default function ClientBillingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewer } = useSpace();
  const establishmentId = String(id);
  const billing = useLoader(viewer?.userId ?? null, `billing:${establishmentId}`, () => loadBilling(establishmentId), [establishmentId]);
  const [note, setNote] = useState("");
  const receipt = useAction("upload_receipt");
  const quote = useAction("accept_quote");
  if (!viewer) return <Loading />;

  async function sendReceipt(chargeId: string, pick: () => Promise<PickResult>) {
    await receipt.run(
      async () => {
        const picked = await pick();
        if (!picked.ok) return picked.reason === "cancelled" ? { ok: true } : { ok: false, error: picked.message };
        const uploaded = await uploadImage({ establishmentId, category: "billing", image: picked.image });
        if (!uploaded.ok) return uploaded;
        return fromError((await supabase.rpc("upload_payment_receipt", { p_charge_id: chargeId, p_file_id: uploaded.fileId, p_note: note.trim() || undefined })).error);
      },
      billing.reload,
      es.finance.receiptUploaded,
    );
  }

  return (
    <Screen title={es.finance.billing} refreshing={billing.loading} onRefresh={billing.reload}>
      {billing.fromCache ? <CacheNotice fetchedAt={billing.fetchedAt} /> : null}
      {billing.error ? <ErrorBox message={billing.error} onRetry={billing.reload} /> : null}
      {billing.data && !billing.data.canView ? <Empty>{es.finance.noBillingAccess}</Empty> : null}
      {receipt.notice ? <Notice tone="success">{receipt.notice}</Notice> : null}
      {receipt.error ? <Notice tone="danger">{receipt.error}</Notice> : null}

      {billing.data && billing.data.quotes.length > 0 ? <Title>{es.finance.quotes}</Title> : null}
      {(billing.data?.quotes ?? []).map((q) => (
        <Card key={q.id}>
          <Title>
            {q.code} · {q.concept}
          </Title>
          <Row label={web.naming.entities.quote} value={euros(q.total_cents)} />
          {quote.error ? <Notice tone="danger">{quote.error}</Notice> : null}
          {quote.notice ? <Notice tone="success">{quote.notice}</Notice> : null}
          <Button label={es.finance.acceptQuote} pending={quote.pending} disabled={!quote.enabled} disabledReason={quote.disabledReason} onPress={() => void quote.run(async () => fromError((await supabase.rpc("accept_quote", { p_quote_id: q.id })).error), billing.reload, es.finance.quoteAccepted)} />
          <Button label={es.finance.rejectQuote} kind="secondary" pending={quote.pending} disabled={!quote.enabled} onPress={() => void quote.run(async () => fromError((await supabase.rpc("reject_quote", { p_quote_id: q.id })).error), billing.reload)} />
        </Card>
      ))}

      {billing.data && billing.data.canView && billing.data.charges.length === 0 ? <Empty>{es.finance.empty}</Empty> : null}
      {(billing.data?.charges ?? []).map((c) => (
        <Card key={c.id} testID={`cobro-${c.id}`}>
          <Title>{c.concept}</Title>
          <Badge tone={c.status === "paid" ? "success" : c.status === "overdue" ? "danger" : "neutral"}>{web.naming.states.charge[c.status as keyof typeof web.naming.states.charge] ?? c.status}</Badge>
          <Row label={web.naming.entities.charge} value={euros(c.total_cents)} />
          <Row label={es.finance.outstanding} value={euros(c.outstanding)} />
          <Body muted>{dayOf(c.due_at, viewer.timezone)}</Body>
          {c.outstanding > 0 ? (
            <>
              <Field label={es.finance.noteLabel} value={note} onChangeText={setNote} />
              <Button label={`${es.finance.uploadReceipt} · ${es.media.takePhoto}`} kind="secondary" pending={receipt.pending} disabled={!receipt.enabled} disabledReason={receipt.disabledReason} onPress={() => void sendReceipt(c.id, takePhoto)} />
              <Button label={`${es.finance.uploadReceipt} · ${es.media.pickPhoto}`} kind="secondary" pending={receipt.pending} disabled={!receipt.enabled} disabledReason={receipt.disabledReason} onPress={() => void sendReceipt(c.id, pickPhoto)} />
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
