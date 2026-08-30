"use client";

import { useActionState, useState } from "react";
import { Button, Field, Modal, Select } from "@/components/ui";
import { es } from "@/i18n/es";
import { inviteMember, type ActionState } from "@/app/espacios/actions";

const initialState: ActionState = { error: null };

export function InviteMemberForm({ spaceId, spaceSlug }: { spaceId: string; spaceSlug: string }) {
  const [open, setOpen] = useState(false);
  const action = inviteMember.bind(null, spaceId, spaceSlug);
  const [state, formAction, pending] = useActionState(action, initialState);
  const t = es.space.team;

  const inviteLink =
    state.inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/invitaciones/${state.inviteToken}`
      : null;

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        {t.inviteButton}
      </Button>
      <Modal
        open={open}
        title={t.inviteFormTitle}
        onClose={() => setOpen(false)}
      >
        {state.message === "already_registered" ? (
          <p className="mb-4 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success">
            {t.alreadyRegistered}
          </p>
        ) : inviteLink ? (
          <div className="mb-4 rounded-lg bg-soft-surface px-3 py-2.5 text-sm text-text">
            <p className="mb-1">{t.invitationCreated}</p>
            <code className="break-all text-primary">{inviteLink}</code>
          </div>
        ) : (
          <form action={formAction}>
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
            {state.error ? (
              <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">
                {state.error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" pending={pending}>
                {pending ? t.submitPending : t.submit}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
