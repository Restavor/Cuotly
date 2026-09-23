"use client";

import { useActionState, useState } from "react";
import { Button, Field, Modal, Select } from "@/components/ui";
import { es } from "@/i18n/es";
import { inviteMember, type ActionState } from "@/app/espacios/actions";

const initialState: ActionState = { error: null };

/**
 * HU-03 y HU-04 · invitar a alguien al equipo. Con `inline`, el
 * formulario va a la vista tal cual —la pestaña Invitaciones (M71) lo
 * dibuja debajo de la lista—; sin él, detrás de un botón y en un modal.
 * Quién puede invitar lo decide el servidor en los dos casos.
 */
export function InviteMemberForm({
  spaceId,
  spaceSlug,
  inline = false,
}: {
  spaceId: string;
  spaceSlug: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = inviteMember.bind(null, spaceId, spaceSlug);
  const [state, formAction, pending] = useActionState(action, initialState);
  const t = es.space.team;

  const inviteLink =
    state.inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/invitaciones/${state.inviteToken}`
      : null;

  const resultado =
    state.message === "already_registered" ? (
      <p role="status" className="mb-4 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-text">
        {t.alreadyRegistered}
      </p>
    ) : inviteLink ? (
      <div role="status" className="mb-4 rounded-lg bg-soft-surface px-3 py-2.5 text-sm text-text">
        <p className="mb-1">{t.invitationCreated}</p>
        <code className="break-all text-primary">{inviteLink}</code>
      </div>
    ) : null;

  const formulario = (
    <form action={formAction}>
      <div className={inline ? "grid gap-x-4 md:grid-cols-2" : undefined}>
        <Field label={t.emailLabel} name="email" type="email" required />
        <Select
          label={t.roleLabel}
          name="role"
          defaultValue="worker"
          options={[
            { value: "worker", label: t.roleWorker },
            { value: "admin", label: t.roleAdmin },
          ]}
        />
      </div>
      {state.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          {pending ? t.submitPending : t.submit}
        </Button>
      </div>
    </form>
  );

  // En la pestaña el formulario se queda para la siguiente invitación: el
  // resultado de la anterior se enseña encima hasta que se envíe otra.
  if (inline) {
    return (
      <>
        {resultado}
        {formulario}
      </>
    );
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        {t.inviteButton}
      </Button>
      <Modal open={open} title={t.inviteFormTitle} onClose={() => setOpen(false)}>
        {resultado ?? formulario}
      </Modal>
    </>
  );
}
