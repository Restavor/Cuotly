"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, Card, Select, TextArea } from "@/components/ui";
import { INCIDENT_NOTE_MAX, INCIDENT_OUTCOMES, type IncidentOutcome, outcomeNeedsCategory } from "@/core/incidents";
import { es } from "@/i18n/es";

import { INITIAL_REQUEST_ACTION } from "./action-state";
import {
  cancelRequestForClient,
  retryAnalysis,
  rejectRequest,
  requestMoreInformation,
  resolveIncident,
  setRequestKind,
  validateClassification,
} from "./actions";

function Error({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

const t = es.teamArea.requests;

const CATEGORIAS = [
  { value: "small", label: es.naming.categories.small },
  { value: "photo", label: es.naming.categories.photo },
  { value: "medium", label: es.naming.categories.medium },
  { value: "large", label: es.naming.categories.large },
];

/**
 * La red de seguridad del análisis automático. La pantalla solo la pinta
 * cuando la solicitud sigue en "Recibida" —o sea, cuando la clasificación
 * automática de RN-CLS-01 no salió— y solo a quien tiene `manage_requests`.
 */
export function RetryAnalysisForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(retryAnalysis, INITIAL_REQUEST_ACTION);
  return (
    <Card title={t.retryTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{t.retryHint}</p>
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? t.retryPending : t.retrySubmit}
        </Button>
      </form>
    </Card>
  );
}

/**
 * HU-11 · validar la propuesta tal cual, en un botón.
 *
 * Los dos valores viajan ocultos porque son los que se están validando, y
 * eso NO los convierte en la autoridad: `validate_classification()`
 * comprueba `manage_requests` y el estado, y quien corrige escribe los
 * suyos en el formulario largo de al lado. Mandar aquí una categoría
 * distinta es exactamente lo mismo que elegirla ahí — no hay nada que
 * saltarse (CLAUDE.md: ocultar un botón no es un control de acceso, y
 * enseñarlo tampoco concede uno).
 */
export function ValidateProposalForm({
  requestId,
  category,
  summary,
  correctHref,
}: {
  requestId: string;
  category: string;
  summary: string;
  correctHref: string;
}) {
  const [state, action, pending] = useActionState(validateClassification, INITIAL_REQUEST_ACTION);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="summary" value={summary} />

      <Error message={state.error} />

      <div className="flex flex-wrap gap-3">
        {/*
          "Corregir" no es un botón que envía nada: abre el formulario
          largo cambiando la dirección, para que el botón de volver del
          navegador lo cierre y el enlace se pueda compartir (CA-22).
        */}
        <Link
          href={correctHref}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {t.correctClassification}
        </Link>

        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? t.validateProposalPending : t.validateProposalSubmit}
        </Button>
      </div>
    </form>
  );
}

/**
 * HU-11 · corregir la clasificación antes de validarla (RN-CLS-03: la
 * propuesta es siempre una propuesta).
 *
 * El resumen es el texto que leerá el restaurante, así que se escribe
 * aquí y no en ningún sitio más.
 */
export function CorrectClassificationForm({
  requestId,
  suggestedCategory,
  suggestedSummary,
  cancelHref,
}: {
  requestId: string;
  suggestedCategory: string | null;
  suggestedSummary: string | null;
  cancelHref: string | null;
}) {
  const [state, action, pending] = useActionState(validateClassification, INITIAL_REQUEST_ACTION);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-text-secondary">{t.validateHint}</p>

      <Select
        label={t.validateCategoryLabel}
        name="category"
        defaultValue={suggestedCategory ?? "small"}
        required
        options={CATEGORIAS}
      />

      <TextArea
        label={t.validateSummaryLabel}
        name="summary"
        required
        defaultValue={suggestedSummary ?? ""}
      />

      <Error message={state.error} />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? t.validatePending : t.validateSubmit}
        </Button>
        {cancelHref === null ? null : (
          <Link
            href={cancelHref}
            className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {t.correctCancel}
          </Link>
        )}
      </div>
    </form>
  );
}

/**
 * RN-REQ-11 · el diagnóstico de una incidencia, en lugar de validar la
 * clasificación. Las cuatro salidas, con lo que pasa en cada una dicho al
 * lado; el tamaño del trabajo solo se pide en las dos que crean trabajo.
 * Que se pueda, y quién, lo decide `resolve_incident()`.
 */
export function ResolveIncidentForm({
  requestId,
  suggestedCategory,
}: {
  requestId: string;
  suggestedCategory: string | null;
}) {
  const [state, action, pending] = useActionState(resolveIncident, INITIAL_REQUEST_ACTION);
  const [outcome, setOutcome] = useState<IncidentOutcome>("restavor_error");
  const ti = es.requestIncidents;

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-text-secondary">{ti.resolveHint}</p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-text">{ti.outcomeLabel}</legend>
        {INCIDENT_OUTCOMES.map((o) => (
          <label key={o} className="flex items-start gap-2 rounded-[10px] border border-border p-3 text-sm text-text">
            <input
              type="radio"
              name="outcome"
              value={o}
              checked={outcome === o}
              onChange={() => setOutcome(o)}
              className="mt-0.5 h-4 w-4 accent-cuotly-green"
            />
            <span>
              <span className="block font-semibold">{ti.outcomes[o]}</span>
              <span className="block text-xs text-text-secondary">{ti.outcomeHints[o]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {outcomeNeedsCategory(outcome) ? (
        <Select
          label={ti.categoryLabel}
          name="category"
          hint={ti.categoryHint}
          defaultValue={suggestedCategory ?? "small"}
          required
          options={CATEGORIAS}
        />
      ) : null}

      <TextArea
        label={ti.noteLabel}
        name="note"
        required
        maxLength={INCIDENT_NOTE_MAX}
        hint={ti.noteHint(INCIDENT_NOTE_MAX)}
      />

      <Error message={state.error} />

      <Button type="submit" disabled={pending}>
        {pending ? ti.pending : ti.submit}
      </Button>
    </form>
  );
}

/**
 * RN-REQ-09 · corregir cambio o incidencia antes de validar, cuando el
 * restaurante se equivocó al elegir. `set_request_kind()` lo permite al
 * equipo solo hasta la validación.
 */
export function ChangeKindForm({ requestId, kind }: { requestId: string; kind: "change" | "incident" }) {
  const [state, action, pending] = useActionState(setRequestKind, INITIAL_REQUEST_ACTION);
  const ti = es.requestIncidents;
  const destino = kind === "change" ? "incident" : "change";

  return (
    <form action={action} className="mt-4 space-y-2 border-t border-border pt-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="kind" value={destino} />
      <p className="text-xs text-text-secondary">{ti.markHint}</p>
      <Error message={state.error} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? ti.markPending : destino === "incident" ? ti.markIncident : ti.markChange}
      </Button>
    </form>
  );
}

export function RequestInformationForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(requestMoreInformation, INITIAL_REQUEST_ACTION);
  return (
    <Card title={t.infoTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{t.infoHint}</p>
        <TextArea label={t.infoLabel} name="message" required />
        <Error message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.infoPending : t.infoSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function RejectRequestForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(rejectRequest, INITIAL_REQUEST_ACTION);
  return (
    <Card title={t.rejectTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{t.rejectHint}</p>
        <TextArea label={t.rejectLabel} name="reason" required />
        <Error message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.rejectPending : t.rejectSubmit}
        </Button>
      </form>
    </Card>
  );
}

/**
 * R12 · cancelar por el restaurante. Solo aparece mientras la solicitud no
 * sea un trabajo: a partir de ahí la cancelación es la otra, la que
 * devuelve el consumo, y vive en la ficha del trabajo.
 */
export function CancelRequestForClientForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(cancelRequestForClient, INITIAL_REQUEST_ACTION);
  return (
    <Card title={t.cancelTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{t.cancelHint}</p>
        <TextArea label={t.cancelLabel} name="reason" rows={2} />
        <Error message={state.error} />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? t.cancelPending : t.cancelSubmit}
        </Button>
      </form>
    </Card>
  );
}
