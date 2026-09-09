"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, Card, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_REQUEST_ACTION } from "./action-state";
import {
  retryAnalysis,
  rejectRequest,
  requestMoreInformation,
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
