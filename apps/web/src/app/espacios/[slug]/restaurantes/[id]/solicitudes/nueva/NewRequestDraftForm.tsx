"use client";

import { useActionState, useState } from "react";

import { FileUploadField } from "@/components/FileUploadField";
import { Button, Card, Field, Select, TextArea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import { INITIAL_NEW_REQUEST_DRAFT } from "./action-state";
import { createRequestDraft } from "./actions";

const t = es.panelRequests;
const ti = es.requestIncidents;
const MAX_DESCRIPTION = 1000;

/**
 * R06 · Nueva solicitud, en dos columnas como el dibujo.
 *
 * Lo que el dibujo pide y aquí NO está, porque no existe en la solicitud:
 * "Asunto" (el título de la fila sale de la primera frase de la
 * descripción, `requestHeadline()`) y "Fecha límite deseada" (no hay
 * columna ni regla que la sostenga). La categoría la decide el equipo al
 * clasificar (RN-CLS); lo que sí elige el restaurante, desde la decisión
 * 83, es si pide un cambio o avisa de algo que no funciona (RN-REQ-09).
 *
 * Lo que está aunque el dibujo no lo pinte: la prioridad y su motivo,
 * obligatorios desde RN-REQ-05.
 */
export function NewRequestDraftForm({
  slug,
  establishmentId,
  establishmentName,
  photoUrl,
}: {
  slug: string;
  establishmentId: string;
  establishmentName: string;
  photoUrl: string | null;
}) {
  const [state, action, pending] = useActionState(createRequestDraft, INITIAL_NEW_REQUEST_DRAFT);
  const [longitud, setLongitud] = useState(state.values.description.length);

  return (
    <form action={action} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="establishmentId" value={establishmentId} />

      <Card>
        <p className="mb-1.5 text-sm font-semibold text-text">{t.restaurantLabel}</p>
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-border bg-soft-surface p-3">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de unos minutos: next/image la cachearía más allá de su caducidad.
            <img src={photoUrl} alt="" className="h-10 w-14 rounded-md object-cover" />
          ) : (
            <span className="flex h-10 w-14 items-center justify-center rounded-md bg-surface text-cuotly-green">
              <Icon name="building" className="h-5 w-5" />
            </span>
          )}
          <span>
            <span className="block text-sm font-semibold text-text">{establishmentName}</span>
            <span className="block text-xs text-text-secondary">{t.restaurantHint}</span>
          </span>
        </div>

        {/* RN-REQ-09 · cambio o incidencia. Una incidencia no gasta del plan (RN-REQ-10). */}
        <Select
          label={ti.kindLabel}
          name="kind"
          required
          hint={ti.kindHint}
          defaultValue={state.values.kind}
          options={[
            { value: "change", label: ti.kinds.change },
            { value: "incident", label: ti.kinds.incident },
          ]}
        />

        <div className="relative">
          <TextArea
            label={es.clientArea.newDescriptionLabel}
            name="description"
            required
            rows={4}
            maxLength={MAX_DESCRIPTION}
            hint={es.clientArea.newDescriptionHelp}
            defaultValue={state.values.description}
            onChange={(e) => setLongitud(e.target.value.length)}
          />
          <span className="pointer-events-none absolute bottom-6 right-3 text-xs text-text-secondary">
            {t.descriptionCount(longitud, MAX_DESCRIPTION)}
          </span>
        </div>

        <Field
          label={es.clientArea.newContextLabel}
          name="context"
          hint={es.clientArea.newContextHelp}
          defaultValue={state.values.context}
        />

        <Select
          label={es.clientArea.newPriorityLabel}
          name="priority"
          required
          hint={es.clientArea.newPriorityHelp}
          defaultValue={state.values.priority}
          options={[
            { value: "high", label: es.clientArea.priorityLevels.high },
            { value: "medium", label: es.clientArea.priorityLevels.medium },
            { value: "low", label: es.clientArea.priorityLevels.low },
          ]}
        />

        <TextArea
          label={es.clientArea.newPriorityReasonLabel}
          name="priorityReason"
          rows={2}
          required
          maxLength={200}
          hint={es.clientArea.newPriorityReasonHelp}
          placeholder={es.clientArea.newPriorityReasonPlaceholder}
          defaultValue={state.values.priorityReason}
        />

        {/* RN-REQ-06 · marcar "Alta" no adelanta el trabajo. */}
        <p className="text-sm text-text-secondary">{es.clientArea.newPriorityNotAPromise}</p>
      </Card>

      <Card className="flex flex-col">
        <h2 className="mb-3 text-base font-semibold text-primary-dark">{t.attachmentsTitle}</h2>
        <div className="rounded-[10px] border-2 border-dashed border-border bg-soft-surface/40 p-4">
          <FileUploadField
            establishmentId={establishmentId}
            category="requests_and_jobs"
            name="attachmentFileId"
          />
          <p className="text-xs text-text-secondary">{t.attachmentsHint}</p>
        </div>

        <div className="mt-6 flex gap-3 rounded-[10px] border border-info/30 bg-info/10 p-4">
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-primary-dark" />
          <div>
            <p className="text-sm font-semibold text-primary-dark">{t.importantTitle}</p>
            <p className="text-sm text-text">{t.importantBody}</p>
          </div>
        </div>

        {state.error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap justify-end gap-3 pt-6">
          <Button type="submit" name="intent" value="save" variant="outline" disabled={pending}>
            {pending ? t.creating : t.saveDraft}
          </Button>
          <Button type="submit" name="intent" value="review" disabled={pending}>
            {pending ? t.creating : t.review}
          </Button>
        </div>
      </Card>
    </form>
  );
}
