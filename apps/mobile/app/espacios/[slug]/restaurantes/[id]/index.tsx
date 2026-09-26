import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { requestTone } from "@/core/requests";

import { DraftsCard } from "../../../../../src/components/Banners";
import { Badge, Body, Button, CacheNotice, Card, Choice, Empty, ErrorBox, Field, Loading, Notice, Row, Screen, Title } from "../../../../../src/components/ui";
import { es, web } from "../../../../../src/i18n/es";
import { fromError, must } from "../../../../../src/lib/api";
import { useOnline } from "../../../../../src/lib/connectivity";
import { newRequestDraft, removeDraft, saveDraft, sendRequestDraft, type Draft, type RequestDraft } from "../../../../../src/lib/drafts";
import { whenAt } from "../../../../../src/lib/format";
import { supabase } from "../../../../../src/lib/supabase";
import { useSpace } from "../../../../../src/lib/space-context";
import { useAction } from "../../../../../src/lib/use-action";
import { useLoader } from "../../../../../src/lib/use-loader";

type ClientHome = {
  name: string;
  requests: { id: string; code: string; state: string; description: string; created_at: string }[];
  allowance: { category: string; included: number; remaining: number }[];
  canWrite: boolean;
};

async function loadClientHome(establishmentId: string): Promise<ClientHome> {
  const [{ data: est, error }, { data: requests }, { data: allowance }] = await Promise.all([
    supabase.from("establishments").select("id, name").eq("id", establishmentId).maybeSingle(),
    supabase
      .from("requests")
      .select("id, code, state, description, created_at")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: establishmentId }),
  ]);
  const e = must(est, error);
  return { name: e.name, requests: requests ?? [], allowance: allowance ?? [], canWrite: true };
}

/**
 * §176 · "solicitar", desde el teléfono: el restaurante pide un cambio con
 * las mismas dos funciones que la web (`create_request_draft` +
 * `submit_request`). El borrador nace con su clave y guarda el id del
 * servidor entre los dos pasos (RN-MOV-10); sin conexión se queda como
 * borrador y se envía cuando se confirma (RN-MOV-09).
 */
export default function ClientHomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewer } = useSpace();
  const router = useRouter();
  const online = useOnline();
  const establishmentId = String(id);
  const home = useLoader(viewer?.userId ?? null, `client-home:${establishmentId}`, () => loadClientHome(establishmentId), [establishmentId]);
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  // RN-REQ-09 · cambio o incidencia, como en la web.
  const [requestKind, setRequestKind] = useState<"change" | "incident">("change");
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const submit = useAction("submit_request");
  if (!viewer) return <Loading />;

  async function send(draft: RequestDraft) {
    if (!viewer) return;
    if (!online) {
      await saveDraft(viewer.userId, draft);
      setDraftNotice(es.offline.draftSaved);
      setDescription("");
      setContext("");
      return;
    }
    setDraftNotice(null);
    await submit.run(
      async () => {
        try {
          const requestId = await sendRequestDraft(draft, {
            create: async (d) => {
              const { data, error } = await supabase.rpc("create_request_draft", { p_establishment_id: d.establishmentId, p_description: d.description, p_context: d.context || undefined });
              const requestId = must(data, error);
              // RN-REQ-09 · nace como cambio; si es una incidencia, se dice
              // antes de enviarla. Lo decide `set_request_kind()`.
              if (d.requestKind === "incident") {
                const { error: tipo } = await supabase.rpc("set_request_kind", { p_request_id: requestId, p_kind: "incident" });
                if (tipo) throw new Error(tipo.message);
              }
              return requestId;
            },
            submit: async (requestId) => {
              const { error } = await supabase.rpc("submit_request", { p_request_id: requestId });
              if (error) throw new Error(error.message);
            },
            persist: (d) => saveDraft(viewer.userId, d),
          });
          await removeDraft(viewer.userId, draft.localId);
          setDescription("");
          setContext("");
          router.push(`/espacios/${viewer.slug}/restaurantes/${establishmentId}/solicitudes/${requestId}` as never);
          return { ok: true };
        } catch (fallo) {
          return fromError(fallo instanceof Error ? fallo : new Error(String(fallo)));
        }
      },
      home.reload,
      es.offline.draftSent,
    );
  }

  function openDraft(draft: Draft) {
    if (draft.kind === "request") void send(draft);
    else router.push(`/espacios/${viewer?.slug}/mensajes/${draft.conversationId}` as never);
  }

  return (
    <Screen title={home.data?.name ?? es.home.client.title} refreshing={home.loading} onRefresh={home.reload}>
      {home.fromCache ? <CacheNotice fetchedAt={home.fetchedAt} /> : null}
      {home.error ? <ErrorBox message={home.error} onRetry={home.reload} /> : null}
      <DraftsCard onOpen={openDraft} />

      {home.data && home.data.allowance.length > 0 ? (
        <Card>
          <Title>{es.home.client.allowance}</Title>
          {home.data.allowance.map((a) => (
            <Row key={a.category} label={web.naming.categories[a.category as keyof typeof web.naming.categories] ?? a.category} value={es.home.client.remaining(a.remaining, a.included)} />
          ))}
        </Card>
      ) : null}

      <Card>
        <Title>{es.home.client.newRequest}</Title>
        <Choice
          label={web.requestIncidents.kindLabel}
          value={requestKind}
          onChange={setRequestKind}
          options={[
            { value: "change", label: web.requestIncidents.kinds.change },
            { value: "incident", label: web.requestIncidents.kinds.incident },
          ]}
        />
        {requestKind === "incident" ? <Body muted>{web.requestIncidents.kindHint}</Body> : null}
        <Field label={es.requests.descriptionLabel} value={description} onChangeText={setDescription} multiline />
        <Field label={es.requests.contextLabel} value={context} onChangeText={setContext} />
        {draftNotice ? <Notice tone="warning">{draftNotice}</Notice> : null}
        {submit.error ? <Notice tone="danger">{submit.error}</Notice> : null}
        {submit.notice ? <Notice tone="success">{submit.notice}</Notice> : null}
        <Button
          label={online ? es.common.send : web.common.save}
          pending={submit.pending}
          disabled={description.trim().length === 0}
          onPress={() => void send(newRequestDraft({ spaceSlug: viewer.slug, establishmentId, description: description.trim(), context: context.trim(), requestKind }))}
        />
      </Card>

      <Title>{es.home.client.openRequests}</Title>
      {home.data && home.data.requests.length === 0 ? <Empty>{es.requests.empty}</Empty> : null}
      {(home.data?.requests ?? []).map((r) => (
        <Card key={r.id} onPress={() => router.push(`/espacios/${viewer.slug}/restaurantes/${establishmentId}/solicitudes/${r.id}` as never)} testID={`solicitud-${r.code}`}>
          <Title>{r.code}</Title>
          <Badge tone={requestTone(r.state)}>{web.naming.states.request[r.state as keyof typeof web.naming.states.request] ?? r.state}</Badge>
          <Body>{r.description}</Body>
          <Body muted>{whenAt(r.created_at, viewer.timezone)}</Body>
        </Card>
      ))}
    </Screen>
  );
}
