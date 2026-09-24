"use client";

import { useActionState, useState } from "react";

import { FileUploadField } from "@/components/FileUploadField";
import { Button, Card, Field, Select, StatusBadge, TextArea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { CHANGE_CATEGORIES } from "@/core/classification-rules";
import { ON_BEHALF_REASON_MAX, PRIORITY_REASON_MAX, REQUEST_PRIORITIES } from "@/core/request-on-behalf";
import { es } from "@/i18n/es";

import { initialOnBehalfRequestState } from "./action-state";
import { createRequestOnBehalf } from "./actions";

const t = es.teamArea.requests.onBehalf;
const MAX_DESCRIPTION = 1000;

export type OnBehalfEstablishment = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly groupName: string | null;
  readonly photoUrl: string | null;
};

/**
 * M77 · el formulario, en dos columnas como el dibujo.
 *
 * Lo que el dibujo pide y aquí NO está:
 *   · "Asunto": la solicitud no tiene asunto; el título de la fila sale de
 *     la primera frase de la descripción (`requestHeadline()`), igual que
 *     en el formulario del restaurante (R06).
 *   · "Guardar borrador": decisión 73. El equipo registra lo que el
 *     restaurante ya pidió y lo envía en un paso; un borrador suyo
 *     aparecería en el panel del restaurante como si lo escribiera él.
 *
 * Lo que está aunque el dibujo no lo pinte: "Cómo lo pidió el
 * restaurante", obligatorio desde la decisión 73, y la nota de que la
 * propuesta la sigue aceptando el restaurante.
 */
export function NewTeamRequestForm({
  slug,
  establishments,
  defaultEstablishmentId,
  idempotencyKey,
}: {
  slug: string;
  establishments: readonly OnBehalfEstablishment[];
  defaultEstablishmentId: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(
    createRequestOnBehalf,
    initialOnBehalfRequestState(defaultEstablishmentId),
  );
  const [establishmentId, setEstablishmentId] = useState(state.values.establishmentId);
  const [category, setCategory] = useState(state.values.category);
  const [longitud, setLongitud] = useState(state.values.description.length);

  const elegido = establishments.find((e) => e.id === establishmentId) ?? null;

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <Card>
        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
          <div>
            <Select
              label={t.establishmentLabel}
              name="establishmentId"
              required
              value={establishmentId}
              onChange={(e) => setEstablishmentId(e.target.value)}
              options={[
                { value: "", label: t.establishmentPlaceholder },
                ...establishments.map((e) => ({ value: e.id, label: e.name })),
              ]}
            />

            {elegido ? (
              <div className="-mt-2 mb-4 flex items-center gap-3 rounded-[10px] border border-border bg-soft-surface p-3">
                {elegido.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada de unos minutos: next/image la cachearía más allá de su caducidad.
                  <img src={elegido.photoUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
                ) : (
                  <span className="flex h-12 w-16 items-center justify-center rounded-md bg-surface text-cuotly-green">
                    <Icon name="building" className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-text">{elegido.name}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {t.establishmentCode(elegido.code)}
                    {elegido.groupName ? ` · ${elegido.groupName}` : ""}
                  </span>
                </span>
              </div>
            ) : null}

            <div className="relative">
              <TextArea
                label={t.descriptionLabel}
                name="description"
                required
                rows={5}
                maxLength={MAX_DESCRIPTION}
                hint={t.descriptionHint}
                defaultValue={state.values.description}
                onChange={(e) => setLongitud(e.target.value.length)}
              />
              <span className="pointer-events-none absolute bottom-6 right-3 text-xs text-text-secondary">
                {es.panelRequests.descriptionCount(longitud, MAX_DESCRIPTION)}
              </span>
            </div>

            <Field
              label={t.contextLabel}
              name="context"
              hint={t.contextHint}
              defaultValue={state.values.context}
            />

            <p className="mb-1.5 text-sm font-semibold text-text">{t.attachmentsTitle}</p>
            <div className="mb-4 rounded-[10px] border-2 border-dashed border-border bg-soft-surface/40 p-4">
              {elegido ? (
                // `key`: el archivo se sube al restaurante elegido; al
                // cambiar de restaurante, lo subido se descarta.
                <FileUploadField
                  key={elegido.id}
                  establishmentId={elegido.id}
                  category="requests_and_jobs"
                  name="attachmentFileId"
                  visibility="shared_with_client"
                />
              ) : (
                <p className="text-sm text-text-secondary">{t.establishmentPlaceholder}</p>
              )}
              <p className="text-xs text-text-secondary">{t.attachmentsHint}</p>
            </div>
          </div>

          <div>
            <div className="relative">
              <Select
                label={t.categoryLabel}
                name="category"
                hint={t.categoryHint}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={[
                  { value: "", label: t.categoryAi },
                  ...CHANGE_CATEGORIES.map((c) => ({ value: c, label: es.naming.categories[c] })),
                ]}
              />
              {category ? (
                <div className="-mt-2 mb-4">
                  <StatusBadge tone="warning">{t.pendingValidation}</StatusBadge>
                </div>
              ) : null}
            </div>

            <Select
              label={t.priorityLabel}
              name="priority"
              required
              hint={t.priorityHint}
              defaultValue={state.values.priority}
              options={REQUEST_PRIORITIES.map((p) => ({
                value: p,
                label: es.clientArea.priorityLevels[p],
              }))}
            />

            <TextArea
              label={t.priorityReasonLabel}
              name="priorityReason"
              rows={2}
              required
              maxLength={PRIORITY_REASON_MAX}
              placeholder={t.priorityReasonPlaceholder}
              defaultValue={state.values.priorityReason}
            />

            <TextArea
              label={t.onBehalfLabel}
              name="onBehalfReason"
              rows={3}
              required
              maxLength={ON_BEHALF_REASON_MAX}
              hint={t.onBehalfHint}
              placeholder={t.onBehalfPlaceholder}
              defaultValue={state.values.onBehalfReason}
            />

            <div className="flex gap-3 rounded-[10px] border border-info/30 bg-info/10 p-4">
              <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-primary-dark" />
              <p className="text-sm text-text">{t.acceptanceNote}</p>
            </div>
          </div>
        </div>

        {state.error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? t.submitting : t.submit}
          </Button>
        </div>
      </Card>
    </form>
  );
}
