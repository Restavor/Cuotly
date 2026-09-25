"use client";

import { useActionState, useState } from "react";

import { Button, Field, Modal, Select, TextArea } from "@/components/ui";
import type { SoleOwnerSpace } from "@/core/platform-admin";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "./action-state";
import { platformDelete, platformRestore } from "./actions";

/**
 * Decisión 81 · eliminar y recuperar desde el panel (RN-ADM-14 a 20).
 *
 * Se pintan solo a quien puede (`canDeleteAccounts()`), por cortesía: cada
 * función de la base lo vuelve a comprobar con `is_platform_account_manager()`.
 * Eliminar pide motivo y escribir el nombre de lo que se elimina (§140);
 * recuperar, el motivo.
 */

type Kind = "space" | "establishment";

function Mensaje({ error, done, texto }: { error: string | null; done: boolean; texto: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-3 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="mb-3 text-sm text-success">
        {texto}
      </p>
    );
  }
  return null;
}

export function DeleteButton({
  kind,
  id,
  name,
  title,
  hint,
}: {
  kind: Kind;
  id: string;
  name: string;
  title: string;
  hint: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(platformDelete, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.deletion;

  return (
    <>
      <Button type="button" variant="danger" className="px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
        {t.deleteAction}
      </Button>
      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <form action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <p className="mb-2 text-sm text-text-secondary">{hint}</p>
          <p className="mb-4 text-sm text-text-secondary">{t.nothingIsErased}</p>
          <TextArea name="reason" label={t.reasonLabel} hint={t.reasonHint} rows={2} required />
          <Field name="confirmation" label={t.confirmationLabel(name)} required autoComplete="off" />
          <Mensaje error={state.error} done={state.done} texto={t.deleted} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {es.common.cancel}
            </Button>
            <Button type="submit" variant="danger" pending={pending} disabled={state.done}>
              {pending ? t.deleting : t.deleteAction}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function RestoreButton({
  kind,
  id,
  name,
  hint,
}: {
  kind: Kind | "account";
  id: string;
  name: string;
  hint: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(platformRestore, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.deletion;

  return (
    <>
      <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
        {t.restoreAction}
      </Button>
      <Modal open={open} title={t.restoreTitle(name)} onClose={() => setOpen(false)}>
        <form action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <p className="mb-4 text-sm text-text-secondary">{hint}</p>
          <TextArea name="reason" label={t.reasonLabel} hint={t.reasonHint} rows={2} required />
          <Mensaje error={state.error} done={state.done} texto={t.restored} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {es.common.cancel}
            </Button>
            <Button type="submit" pending={pending} disabled={state.done}>
              {pending ? t.restoring : t.restoreAction}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * RN-ADM-18/19 · eliminar una cuenta. De cada espacio del que es la única
 * propietaria se elige quién se queda con él —o al azar—; la lista ya
 * viene filtrada por el servidor: administradores y, si no hay ninguno,
 * trabajadores.
 */
export function AccountDeletionForm({
  userId,
  email,
  spaces,
}: {
  userId: string;
  email: string;
  spaces: readonly SoleOwnerSpace[];
}) {
  const [state, action, pending] = useActionState(platformDelete, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.deletion;
  const ta = t.account;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value="account" />
      <input type="hidden" name="id" value={userId} />

      {spaces.length > 0 ? (
        <div className="rounded-[10px] border border-border p-4">
          <p className="mb-1 text-sm font-semibold text-text">{ta.successorsTitle}</p>
          <p className="mb-4 text-sm text-text-secondary">{ta.successorsHint}</p>
          {spaces.map((space) =>
            space.candidates.length === 0 ? (
              <p key={space.spaceId} className="mb-3 text-sm text-text">
                {ta.noSuccessor(space.spaceName)}
              </p>
            ) : (
              <Select
                key={space.spaceId}
                name={`successor:${space.spaceId}`}
                label={ta.successorLabel(space.spaceName)}
                defaultValue=""
                options={[
                  { value: "", label: ta.random },
                  ...space.candidates.map((c) => ({
                    value: c.userId,
                    label: `${c.name} · ${c.role === "admin" ? ta.roleAdmin : ta.roleWorker}`,
                  })),
                ]}
              />
            ),
          )}
        </div>
      ) : null}

      <TextArea name="reason" label={t.reasonLabel} hint={t.reasonHint} rows={2} required />
      <Field name="confirmation" label={t.confirmationLabel(email)} required autoComplete="off" />
      <Mensaje error={state.error} done={state.done} texto={t.deleted} />
      <Button type="submit" variant="danger" pending={pending} disabled={state.done}>
        {pending ? t.deleting : ta.submit}
      </Button>
    </form>
  );
}
