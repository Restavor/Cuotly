"use client";

import { useActionState, useState } from "react";
import { Button, Field, Modal } from "@/components/ui";
import { es } from "@/i18n/es";
import { createEstablishment, type ActionState } from "@/app/espacios/actions";

const initialState: ActionState = { error: null };

export function NewEstablishmentForm({ spaceId, spaceSlug }: { spaceId: string; spaceSlug: string }) {
  const [open, setOpen] = useState(false);
  const action = createEstablishment.bind(null, spaceId, spaceSlug);
  const [state, formAction, pending] = useActionState(action, initialState);
  const t = es.space.establishments;

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t.newButton}</Button>
      <Modal open={open} title={t.formTitle} onClose={() => setOpen(false)}>
        <form
          action={async (formData) => {
            await formAction(formData);
            setOpen(false);
          }}
        >
          <Field label={t.groupLabel} name="groupName" required />
          <Field label={t.nameLabel} name="establishmentName" required />
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
      </Modal>
    </>
  );
}
