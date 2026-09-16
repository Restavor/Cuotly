import { useState } from "react";

import { PAYMENT_METHODS, type PaymentMethod } from "@/core/finance";

import { Badge, Body, Button, CacheNotice, Card, Choice, Empty, ErrorBox, Field, Loading, Notice, Row, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { fromError, must } from "../../../../src/lib/api";
import { dayOf, euros, parseEurosToCents } from "../../../../src/lib/format";
import { newIdempotencyKey } from "../../../../src/lib/ids";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useAction } from "../../../../src/lib/use-action";
import { useLoader } from "../../../../src/lib/use-loader";

type Charge = {
  id: string;
  concept: string;
  establishment_id: string;
  total_cents: number;
  due_at: string;
  establishmentName: string;
  status: string;
  outstanding: number;
};

async function loadCharges(spaceId: string): Promise<Charge[]> {
  const [{ data: rows, error }, { data: ests }] = await Promise.all([
    supabase.from("charges").select("id, concept, establishment_id, total_cents, due_at").eq("space_id", spaceId).order("due_at", { ascending: false }).limit(60),
    supabase.from("establishments").select("id, name").eq("space_id", spaceId),
  ]);
  const names = new Map((ests ?? []).map((e) => [e.id, e.name]));
  const charges = must(rows, error);
  const enriched = await Promise.all(
    charges.map(async (c) => {
      const [{ data: status }, { data: outstanding }] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: c.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: c.id }),
      ]);
      return { ...c, establishmentName: names.get(c.establishment_id) ?? "", status: status ?? "pending", outstanding: outstanding ?? 0 };
    }),
  );
  return enriched;
}

function toneOf(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "paid") return "success";
  if (status === "overdue") return "danger";
  if (status === "partially_paid") return "warning";
  return "neutral";
}

/**
 * §176 · "pagar o confirmar" del lado del equipo: registrar un pago a
 * mano (transferencia o Bizum, RN-FIN) con clave de idempotencia. El
 * estado de cada cobro lo dice el servidor (`charge_status`, RN-DAT-05).
 */
export default function FinanceScreen() {
  const { viewer } = useSpace();
  const list = useLoader(viewer?.userId ?? null, `charges:${viewer?.spaceId}`, () => loadCharges(viewer?.spaceId as string), [viewer?.spaceId]);
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newIdempotencyKey("payment"));
  const register = useAction("register_payment");
  if (!viewer) return <Loading />;
  const canRegister = viewer.role === "owner" || viewer.role === "admin";

  async function submit(c: Charge) {
    const cents = parseEurosToCents(amount);
    if (cents === null || cents <= 0) {
      register.reset();
      return void register.run(async () => ({ ok: false, error: es.finance.amountInvalid }));
    }
    await register.run(
      async () =>
        fromError(
          (
            await supabase.rpc("register_payment", {
              p_charge_id: c.id,
              p_amount_cents: cents,
              p_method: method as string,
              p_note: note.trim() || undefined,
              p_idempotency_key: key,
            })
          ).error,
        ),
      () => {
        setOpen(null);
        setAmount("");
        setNote("");
        setKey(newIdempotencyKey("payment"));
        list.reload();
      },
      es.finance.registered,
    );
  }

  return (
    <Screen title={es.finance.title} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {register.notice ? <Notice tone="success">{register.notice}</Notice> : null}
      {list.data && list.data.length === 0 ? <Empty>{es.finance.empty}</Empty> : null}
      {(list.data ?? []).map((c) => (
        <Card key={c.id} testID={`cobro-${c.id}`}>
          <Title>
            {c.establishmentName} · {c.concept}
          </Title>
          <Badge tone={toneOf(c.status)}>{web.naming.states.charge[c.status as keyof typeof web.naming.states.charge] ?? c.status}</Badge>
          <Row label={web.naming.entities.charge} value={euros(c.total_cents)} />
          <Row label={es.finance.outstanding} value={euros(c.outstanding)} />
          <Body muted>{dayOf(c.due_at, viewer.timezone)}</Body>
          {canRegister && c.outstanding > 0 && open !== c.id ? (
            <Button label={es.finance.registerPayment} kind="secondary" onPress={() => { setOpen(c.id); setAmount((c.outstanding / 100).toFixed(2).replace(".", ",")); register.reset(); }} />
          ) : null}
          {open === c.id ? (
            <>
              <Field label={es.finance.amountLabel} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
              <Choice label={es.finance.methodLabel} options={PAYMENT_METHODS.map((m) => ({ value: m, label: web.teamArea.methods[m] }))} value={method} onChange={setMethod} />
              <Field label={es.finance.noteLabel} value={note} onChangeText={setNote} />
              {register.error ? <Notice tone="danger">{register.error}</Notice> : null}
              <Button
                label={es.finance.registerPayment}
                pending={register.pending}
                disabled={!register.enabled || !method}
                disabledReason={register.disabledReason}
                onPress={() => void submit(c)}
              />
              <Button label={web.common.cancel} kind="secondary" onPress={() => setOpen(null)} />
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
