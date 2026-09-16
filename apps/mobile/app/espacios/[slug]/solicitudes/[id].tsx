import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { CHANGE_CATEGORIES, type ChangeCategory } from "@/core/classification-rules";
import { requestTone } from "@/core/requests";

import { Badge, Body, Button, CacheNotice, Card, Choice, ErrorBox, Field, Loading, Notice, Row, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { fromError, must } from "../../../../src/lib/api";
import { whenAt } from "../../../../src/lib/format";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useAction } from "../../../../src/lib/use-action";
import { useLoader } from "../../../../src/lib/use-loader";

type Detail = {
  id: string;
  code: string;
  state: string;
  description: string;
  context: string | null;
  validated_category: string | null;
  validated_summary: string | null;
  rejected_reason: string | null;
  created_at: string;
  establishment_id: string;
  establishmentName: string;
  jobId: string | null;
  conversationId: string | null;
};

async function loadDetail(id: string): Promise<Detail> {
  const { data, error } = await supabase
    .from("requests")
    .select("id, code, state, description, context, validated_category, validated_summary, rejected_reason, created_at, establishment_id")
    .eq("id", id)
    .maybeSingle();
  const request = must(data, error);
  const [{ data: est }, { data: job }, { data: conversationId }] = await Promise.all([
    supabase.from("establishments").select("id, name").eq("id", request.establishment_id).maybeSingle(),
    supabase.from("jobs").select("id").eq("request_id", id).maybeSingle(),
    supabase.rpc("get_or_create_request_conversation", { p_request_id: id }),
  ]);
  return { ...request, establishmentName: est?.name ?? "", jobId: job?.id ?? null, conversationId: conversationId ?? null };
}

const VALIDATABLE = ["analyzing", "pending_internal_validation", "needs_information"];

/**
 * §176 · el equipo valida (RN-CLS: categoría y resumen), pide más
 * información o rechaza. Aceptar es del restaurante (RN-REQ-02): aquí no
 * está el botón, y aunque estuviera el servidor se negaría.
 */
export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewer } = useSpace();
  const router = useRouter();
  const detail = useLoader(viewer?.userId ?? null, `request:${id}`, () => loadDetail(String(id)), [id]);

  const [category, setCategory] = useState<ChangeCategory | null>(null);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const validate = useAction("accept_request");
  const moreInfo = useAction("accept_request");
  const reject = useAction("accept_request");

  if (!viewer || detail.loading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorBox message={detail.error ?? web.states.errorDescription} onRetry={detail.reload} />;
  const r = detail.data;
  const stateLabel = web.naming.states.request[r.state as keyof typeof web.naming.states.request] ?? r.state;

  return (
    <Screen title={`${es.requests.detail} ${r.code}`} refreshing={detail.loading} onRefresh={detail.reload}>
      {detail.fromCache ? <CacheNotice fetchedAt={detail.fetchedAt} /> : null}
      <Card>
        <Badge tone={requestTone(r.state)}>{stateLabel}</Badge>
        <Title>{r.establishmentName}</Title>
        <Body>{r.description}</Body>
        {r.context ? <Body muted>{r.context}</Body> : null}
        <Row label={web.naming.entities.request} value={whenAt(r.created_at, viewer.timezone)} />
        {r.validated_category ? (
          <Row label={es.requests.categoryLabel} value={web.naming.categories[r.validated_category as keyof typeof web.naming.categories] ?? r.validated_category} />
        ) : null}
        {r.validated_summary ? <Body muted>{r.validated_summary}</Body> : null}
        {r.rejected_reason ? <Notice tone="danger">{r.rejected_reason}</Notice> : null}
      </Card>

      {r.conversationId ? (
        <Button label={es.requests.conversation} kind="secondary" onPress={() => router.push(`/espacios/${viewer.slug}/mensajes/${r.conversationId}` as never)} />
      ) : null}
      {r.jobId ? <Button label={web.naming.entities.job} kind="secondary" onPress={() => router.push(`/espacios/${viewer.slug}/trabajos/${r.jobId}` as never)} /> : null}

      {VALIDATABLE.includes(r.state) ? (
        <Card>
          <Title>{es.requests.validateTitle}</Title>
          <Choice
            label={es.requests.categoryLabel}
            options={CHANGE_CATEGORIES.map((c) => ({ value: c, label: web.naming.categories[c] }))}
            value={category}
            onChange={setCategory}
          />
          <Field label={es.requests.summaryLabel} value={summary} onChangeText={setSummary} multiline />
          {validate.error ? <Notice tone="danger">{validate.error}</Notice> : null}
          {validate.notice ? <Notice tone="success">{validate.notice}</Notice> : null}
          <Button
            label={es.requests.validate}
            pending={validate.pending}
            disabled={!validate.enabled || !category || summary.trim().length === 0}
            disabledReason={validate.disabledReason}
            onPress={() =>
              void validate.run(
                async () =>
                  fromError(
                    (await supabase.rpc("validate_classification", { p_request_id: r.id, p_category: category as string, p_summary: summary.trim() })).error,
                  ),
                detail.reload,
              )
            }
          />

          <Field label={es.requests.moreInfoLabel} value={message} onChangeText={setMessage} multiline />
          {moreInfo.error ? <Notice tone="danger">{moreInfo.error}</Notice> : null}
          <Button
            label={es.requests.moreInfo}
            kind="secondary"
            pending={moreInfo.pending}
            disabled={!moreInfo.enabled || message.trim().length === 0}
            disabledReason={moreInfo.disabledReason}
            onPress={() =>
              void moreInfo.run(
                async () => fromError((await supabase.rpc("request_more_information", { p_request_id: r.id, p_message: message.trim() })).error),
                detail.reload,
              )
            }
          />

          <Field label={es.requests.rejectLabel} value={reason} onChangeText={setReason} />
          {reject.error ? <Notice tone="danger">{reject.error}</Notice> : null}
          <Button
            label={es.requests.reject}
            kind="danger"
            pending={reject.pending}
            disabled={!reject.enabled || reason.trim().length === 0}
            disabledReason={reject.disabledReason}
            onPress={() => void reject.run(async () => fromError((await supabase.rpc("reject_request", { p_request_id: r.id, p_reason: reason.trim() })).error), detail.reload)}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
