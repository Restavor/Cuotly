"use client";

import { useActionState, useId, useState, useSyncExternalStore } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { INCIDENT_CATEGORIES, INCIDENT_IMPACTS, INCIDENT_KINDS, type IncidentKind } from "@/core/support";
import { es } from "@/i18n/es";

import { INITIAL_HELP_STATE } from "../../action-state";
import { openIncidentAction } from "../../actions";

/**
 * RN-SOP-03 · el formulario de §131, y lo que "Cuotly puede recoger
 * informando al usuario": navegador, sistema y pantalla se leen del
 * navegador, se ENSEÑAN antes de enviar y viajan en campos ocultos. El
 * servidor solo guarda esas claves. RN-SOP-14: la clave de idempotencia
 * nace con el formulario, así que dos envíos abren una.
 */
type Contexto = { readonly browser: string; readonly os: string; readonly screen: string };

let contextoLeido: Contexto | null | undefined;

function leerContexto(): Contexto | null {
  if (contextoLeido !== undefined) return contextoLeido;
  try {
    const nav = window.navigator as Navigator & { userAgentData?: { platform?: string } };
    contextoLeido = {
      browser: nav.userAgent.slice(0, 200),
      os: nav.userAgentData?.platform ?? nav.platform ?? "",
      screen: `${window.screen.width}x${window.screen.height}`,
    };
  } catch {
    contextoLeido = null;
  }
  return contextoLeido;
}

function suscribirNada(): () => void {
  return () => {};
}

export function NewIncidentForm({ spaceId, slug, helpQuery }: { spaceId: string; slug: string; helpQuery: string }) {
  const [state, action, pending] = useActionState(openIncidentAction, INITIAL_HELP_STATE);
  const [kind, setKind] = useState<IncidentKind>("error");
  // El navegador es un sistema externo: se lee con `useSyncExternalStore`,
  // que en el servidor devuelve `null` y en el cliente el mismo objeto en
  // cada lectura (está cacheado), sin efectos ni estados intermedios.
  const contexto = useSyncExternalStore(suscribirNada, leerContexto, () => null);
  const key = useId();
  const t = es.help.newIncident;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="helpQuery" value={helpQuery} />
      <input type="hidden" name="idempotencyKey" value={`incident:${spaceId}:${key}`} />

      {helpQuery ? <p className="text-sm text-text-secondary">{t.fromSearch(helpQuery)}</p> : null}

      <Select
        name="kind"
        label={t.kindLabel}
        value={kind}
        onChange={(e) => setKind(e.target.value as IncidentKind)}
        options={INCIDENT_KINDS.map((k) => ({ value: k, label: es.incidents.kinds[k] }))}
      />
      <Select
        name="category"
        label={t.categoryLabel}
        options={INCIDENT_CATEGORIES.map((c) => ({ value: c, label: es.incidents.categories[c] }))}
        required
      />
      {kind === "error" ? (
        <Select
          name="impact"
          label={t.impactLabel}
          hint={t.impactHint}
          options={INCIDENT_IMPACTS.map((i) => ({ value: i, label: es.incidents.impacts[i] }))}
          required
        />
      ) : null}
      <TextArea name="description" label={t.descriptionLabel} hint={t.descriptionHint} rows={6} required />
      <Field name="device" label={t.deviceLabel} maxLength={120} />
      <Field name="appVersion" label={t.appVersionLabel} maxLength={40} />

      <div className="rounded-[10px] bg-soft-surface p-3">
        <p className="text-xs font-semibold text-text">{t.contextTitle}</p>
        <p className="text-xs text-text-secondary">{t.contextHint}</p>
        {contexto === null ? (
          <p className="mt-1 text-xs text-text-secondary">{t.contextUnavailable}</p>
        ) : (
          <ul className="mt-1 text-xs text-text">
            <li>browser: {contexto.browser}</li>
            <li>os: {contexto.os || "—"}</li>
            <li>screen: {contexto.screen}</li>
          </ul>
        )}
        <input type="hidden" name="ctxBrowser" value={contexto?.browser ?? ""} />
        <input type="hidden" name="ctxOs" value={contexto?.os ?? ""} />
        <input type="hidden" name="ctxScreen" value={contexto?.screen ?? ""} />
      </div>

      <Button type="submit" pending={pending}>
        {pending ? t.pending : t.submit}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
