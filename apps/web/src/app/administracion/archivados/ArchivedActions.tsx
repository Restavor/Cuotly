"use client";

import { useActionState, useState } from "react";

import { Button, Field, Modal, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../action-state";
import { platformDeletePermanently, platformRecover } from "../actions";

/**
 * Decisión 82 · los dos botones de cada fila de Archivados (RN-ADM-23 y 24).
 *
 * Se pintan solo a quien tiene el permiso fino, por cortesía: las dos
 * funciones de la base lo vuelven a comprobar con
 * `is_platform_account_manager()` y la sesión en dos pasos.
 */

type Kind = "space" | "establishment";

/**
 * RN-ADM-23 · recuperar es un clic, sin nada que rellenar: el motivo lo
 * pone la base, fijo. Mientras se envía y después de hecho, el botón se
 * desactiva; y si aun así llega un segundo clic, la base no hace nada
 * (CA-17) y la acción lo dice.
 */
export function RecoverButton({ kind, id }: { kind: Kind; id: string }) {
  const [state, action, pending] = useActionState(platformRecover, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.archived;

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="secondary"
        className="px-3 py-1.5 text-xs"
        pending={pending}
        disabled={state.done}
      >
        {pending ? t.recovering : t.recover}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-xs text-success">
          {t.recovered}
        </p>
      ) : null}
    </form>
  );
}

/**
 * RN-ADM-24 · eliminar definitivamente: se confirma antes, con el motivo y
 * escribiendo el nombre (§140), y el aviso dice que no se deshace pero que
 * no se borra nada.
 */
export function PermanentDeleteButton({ kind, id, name }: { kind: Kind; id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(platformDeletePermanently, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.archived;
  const td = es.platformAdmin.deletion;

  return (
    <>
      <Button type="button" variant="danger" className="px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
        {t.deleteAction}
      </Button>
      <Modal
        open={open}
        title={kind === "space" ? t.deleteSpaceTitle(name) : t.deleteEstablishmentTitle(name)}
        onClose={() => setOpen(false)}
      >
        <form action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <p role="note" className="mb-2 text-sm font-semibold text-danger">
            {t.deleteWarning}
          </p>
          <p className="mb-4 text-sm text-text-secondary">
            {kind === "space" ? t.deleteSpaceHint : t.deleteEstablishmentHint}
          </p>
          <TextArea name="reason" label={td.reasonLabel} hint={td.reasonHint} rows={2} required />
          <Field name="confirmation" label={td.confirmationLabel(name)} required autoComplete="off" />
          {state.error ? (
            <p role="alert" className="mb-3 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.done ? (
            <p role="status" className="mb-3 text-sm text-success">
              {t.deleted}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {es.common.cancel}
            </Button>
            <Button type="submit" variant="danger" pending={pending} disabled={state.done}>
              {pending ? t.deleting : t.deleteConfirm}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
