"use client";

import { useActionState, useState } from "react";
import { Button, Card, Modal } from "@/components/ui";
import { es } from "@/i18n/es";
import { createRestavorSpace, type ActionState } from "@/app/espacios/actions";

const initialState: ActionState = { error: null };

/**
 * Solo se muestra a quien pasa is_platform_owner() en el servidor (ver
 * app/page.tsx) — pero aunque alguien manipulara el cliente para verlo,
 * la función create_restavor_space() en la base de datos vuelve a
 * comprobarlo y rechaza a cualquier otra persona (CA-01).
 */
export function CreateRestavorCard() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createRestavorSpace, initialState);
  const t = es.platform.createRestavor;

  return (
    <Card title={t.title} className="mx-auto mt-16 max-w-md text-center">
      <p className="mb-4 text-sm text-text-secondary">{t.description}</p>
      <Button onClick={() => setOpen(true)}>{t.button}</Button>

      <Modal open={open} title={t.confirmTitle} onClose={() => setOpen(false)}>
        <p className="mb-5 text-sm text-text">{t.confirmBody}</p>
        {state.error ? (
          <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <form action={formAction} className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {t.confirmCancel}
          </Button>
          <Button type="submit" pending={pending}>
            {pending ? t.pending : t.confirmAction}
          </Button>
        </form>
      </Modal>
    </Card>
  );
}
