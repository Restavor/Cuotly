import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { requestTone } from "@/core/requests";

import { Conversation } from "../../../../../../src/components/Conversation";
import { Badge, Body, Button, CacheNotice, Card, ErrorBox, Field, Loading, Notice, Row, Screen, Title } from "../../../../../../src/components/ui";
import { es, web } from "../../../../../../src/i18n/es";
import { fromError, must } from "../../../../../../src/lib/api";
import { whenAt } from "../../../../../../src/lib/format";
import { supabase } from "../../../../../../src/lib/supabase";
import { useSpace } from "../../../../../../src/lib/space-context";
import { useAction } from "../../../../../../src/lib/use-action";
import { useLoader } from "../../../../../../src/lib/use-loader";

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
  job: { job_id: string; state: string; correction_window_ends_at: string | null; free_correction_used: boolean } | null;
  conversationId: string | null;
  /** Calculado al cargar, con el reloj de ese momento: la pantalla no mira la hora. */
  windowOpen: boolean;
};

async function loadDetail(requestId: string): Promise<Detail> {
  const { data, error } = await supabase
    .from("requests")
    .select("id, code, state, description, context, validated_category, validated_summary, rejected_reason, created_at")
    .eq("id", requestId)
    .maybeSingle();
  const r = must(data, error);
  const [{ data: jobs }, { data: conversationId }] = await Promise.all([
    supabase.rpc("client_request_job", { p_request_id: requestId }),
    supabase.rpc("get_or_create_request_conversation", { p_request_id: requestId }),
  ]);
  const job = jobs && jobs.length > 0 ? jobs[0] : null;
  const windowOpen = job?.correction_window_ends_at ? new Date(job.correction_window_ends_at).getTime() > Date.now() : false;
  return { ...r, job, conversationId: conversationId ?? null, windowOpen };
}

/**
 * §176 · "aceptar" y "corregir" del restaurante: `accept_request`
 * (RN-REQ-02, consume de la bolsa) y `request_free_correction` (RN-COR-01,
 * dentro de la ventana). Las dos condiciones las comprueba el servidor.
 */
export default function ClientRequestScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { viewer } = useSpace();
  const detail = useLoader(viewer?.userId ?? null, `client-request:${requestId}`, () => loadDetail(String(requestId)), [requestId]);
  const [correction, setCorrection] = useState("");
  const accept = useAction("accept_request");
  const correct = useAction("request_correction");
  if (!viewer || detail.loading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorBox message={detail.error ?? web.states.errorDescription} onRetry={detail.reload} />;
  const r = detail.data;

  return (
    <Screen title={`${es.requests.detail} ${r.code}`} refreshing={detail.loading} onRefresh={detail.reload}>
      {detail.fromCache ? <CacheNotice fetchedAt={detail.fetchedAt} /> : null}
      <Card>
        <Badge tone={requestTone(r.state)}>{web.naming.states.request[r.state as keyof typeof web.naming.states.request] ?? r.state}</Badge>
        <Body>{r.description}</Body>
        {r.context ? <Body muted>{r.context}</Body> : null}
        <Row label={web.naming.entities.request} value={whenAt(r.created_at, viewer.timezone)} />
        {r.validated_category ? (
          <Row label={es.requests.categoryLabel} value={web.naming.categories[r.validated_category as keyof typeof web.naming.categories] ?? r.validated_category} />
        ) : null}
        {r.validated_summary ? <Body>{r.validated_summary}</Body> : null}
        {r.rejected_reason ? <Notice tone="danger">{r.rejected_reason}</Notice> : null}
      </Card>

      {r.state === "pending_client_acceptance" ? (
        <Card>
          <Body muted>{es.requests.acceptHint}</Body>
          {accept.error ? <Notice tone="danger">{accept.error}</Notice> : null}
          {accept.notice ? <Notice tone="success">{accept.notice}</Notice> : null}
          <Button
            label={es.requests.accept}
            pending={accept.pending}
            disabled={!accept.enabled}
            disabledReason={accept.disabledReason}
            onPress={() => void accept.run(async () => fromError((await supabase.rpc("accept_request", { p_request_id: r.id })).error), detail.reload)}
          />
        </Card>
      ) : null}

      {r.job && r.job.state === "published" ? (
        <Card>
          <Title>{es.requests.correction}</Title>
          {r.job.free_correction_used || !r.windowOpen ? (
            <Body muted>{es.requests.correctionClosed}</Body>
          ) : (
            <>
              <Body muted>{es.jobs.correctionWindow(whenAt(r.job.correction_window_ends_at, viewer.timezone))}</Body>
              <Field label={es.requests.correctionLabel} value={correction} onChangeText={setCorrection} multiline />
              {correct.error ? <Notice tone="danger">{correct.error}</Notice> : null}
              {correct.notice ? <Notice tone="success">{correct.notice}</Notice> : null}
              <Button
                label={es.requests.correction}
                pending={correct.pending}
                disabled={!correct.enabled || correction.trim().length === 0}
                disabledReason={correct.disabledReason}
                onPress={() =>
                  void correct.run(
                    async () => fromError((await supabase.rpc("request_free_correction", { p_job_id: r.job?.job_id as string, p_description: correction.trim() })).error),
                    detail.reload,
                  )
                }
              />
            </>
          )}
        </Card>
      ) : null}

      {r.conversationId ? (
        <>
          <Title>{es.requests.conversation}</Title>
          <Conversation conversationId={r.conversationId} spaceSlug={viewer.slug} userId={viewer.userId} timezone={viewer.timezone} />
        </>
      ) : null}
    </Screen>
  );
}
