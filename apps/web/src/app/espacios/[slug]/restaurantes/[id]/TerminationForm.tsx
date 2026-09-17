"use client";

import { useActionState } from "react";

import { Button, Card, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SERVICE_STATUS } from "@/components/establishment/service-status-action-state";
import { requestOwnTermination } from "./actions";

const t = es.clientArea.termination;

/**
 * R24 · RN-EST-09 — el restaurante comunica la baja del servicio.
 *
 * Es la misma función que usa el equipo para registrar la que llegó por
 * teléfono (M47): el hecho es el mismo, y `requested_by_client` distingue
 * quién lo comunicó. Dos funciones para lo mismo acabarían contando la
 * historia de dos maneras.
 *
 * Lo que la pantalla tiene que dejar clarísimo, y por eso va antes del
 * botón: **comunicar la baja no corta el servicio hoy**. Pasa a
 * "Finalizando", que quiere decir que no se renueva; hasta cuándo hay
 * servicio lo marcan el periodo pagado y la permanencia (RN-EST-09), y eso
 * no lo decide este formulario.
 */
export function TerminationForm({
  establishmentId,
  status,
  canWrite,
}: {
  establishmentId: string;
  status: string;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(requestOwnTermination, INITIAL_SERVICE_STATUS);

  if (status === "ending") {
    return (
      <Card title={t.title}>
        <p className="text-sm text-text-secondary">{t.already}</p>
      </Card>
    );
  }

  if (status === "suspended" || status === "archived") {
    return (
      <Card title={t.title}>
        <p className="text-sm text-text-secondary">{t.noService}</p>
      </Card>
    );
  }

  if (!canWrite) {
    return (
      <Card title={t.title}>
        <p className="text-sm text-text-secondary">{t.onlyOwner}</p>
      </Card>
    );
  }

  return (
    <Card title={t.title}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="establishmentId" value={establishmentId} />
        <p className="text-sm text-text-secondary">{t.hint}</p>
        <TextArea label={t.reasonLabel} name="reason" rows={2} required />
        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        {state.done ? (
          <p role="status" className="text-sm text-success">
            {t.done}
          </p>
        ) : null}
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? t.pending : t.submit}
        </Button>
      </form>
    </Card>
  );
}
