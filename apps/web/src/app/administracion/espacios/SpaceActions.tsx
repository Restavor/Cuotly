"use client";

import { useActionState, useId, useState } from "react";

import { Button, Field, Modal, Select, TextArea } from "@/components/ui";
import { SUPPORT_ACCESS_LEVELS, SUPPORT_SESSION_MINUTES } from "@/core/platform-admin";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../action-state";
import { openSupportSession, reactivateSpace } from "../actions";

/**
 * RN-ADM-06 · abrir Modo soporte sobre un espacio: motivo obligatorio, el
 * nivel mínimo necesario y la duración. La clave de idempotencia se genera
 * al montar el formulario, así que pulsar dos veces devuelve la misma
 * sesión (CA-17). Al abrirse, la acción redirige al espacio.
 */
export function StartSupportForm({
  spaceId,
  spaceSlug,
  spaceName,
}: {
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(openSupportSession, INITIAL_ADMIN_STATE);
  const key = useId();
  const t = es.platformAdmin.support;

  return (
    <>
      <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
        {t.startTitle}
      </Button>
      <Modal open={open} title={`${t.startTitle} · ${spaceName}`} onClose={() => setOpen(false)}>
        <form action={action}>
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="spaceSlug" value={spaceSlug} />
          <input type="hidden" name="idempotencyKey" value={`support:${spaceId}:${key}`} />
          <p className="mb-4 text-sm text-text-secondary">{t.startHint}</p>
          <TextArea name="reason" label={t.startReason} required rows={3} />
          <Select
            name="level"
            label={t.startLevel}
            defaultValue="read"
            options={SUPPORT_ACCESS_LEVELS.map((level) => ({
              value: level,
              label: `${t.levels[level]} · ${t.levelHints[level]}`,
            }))}
          />
          <Field
            name="minutes"
            label={t.startMinutes}
            type="number"
            min={SUPPORT_SESSION_MINUTES.min}
            max={SUPPORT_SESSION_MINUTES.max}
            defaultValue={SUPPORT_SESSION_MINUTES.default}
            required
          />
          {state.error ? (
            <p role="alert" className="mb-3 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {es.common.cancel}
            </Button>
            <Button type="submit" pending={pending}>
              {pending ? t.starting : t.start}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** RN-SUB-09 · reactivar un espacio archivado desde la plataforma, con motivo. */
export function ReactivateForm({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState(reactivateSpace, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.spaces;

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input
        name="reason"
        aria-label={t.reactivateReason}
        placeholder={t.reactivateReason}
        required
        className="rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-xs text-text"
      />
      <Button type="submit" variant="secondary" pending={pending} className="px-3 py-1.5 text-xs">
        {pending ? t.reactivatePending : t.reactivate}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-xs text-text-secondary">
          {t.reactivated}
        </p>
      ) : null}
    </form>
  );
}
