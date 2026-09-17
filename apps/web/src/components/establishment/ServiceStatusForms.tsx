"use client";

import { useActionState } from "react";

import { Button, Card, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SERVICE_STATUS } from "./service-status-action-state";
import {
  archiveEstablishment,
  reactivateEstablishment,
  registerTerminationFromOutside,
} from "./service-status-actions";

const t = es.establishmentSheet;

function Feedback({ state }: { state: { error: string | null; done: boolean } }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.done) {
    return (
      <p role="status" className="text-sm text-success">
        {t.serviceDone}
      </p>
    );
  }
  return null;
}

/**
 * M84 y M47 · lo que el equipo puede hacer con el estado de servicio de un
 * restaurante, y solo eso.
 *
 * Los siete estados de `establishments.status` NO se ofrecen como un
 * desplegable, y no es un olvido: `paused` y `suspended` los pone y los
 * quita el barrido de impago (RN-FIN-10, RN-FIN-11), `read_only` lo pone
 * RN-EST-10 al vencer el periodo, y `configuring` es de la puesta en
 * marcha. Poner esos cuatro a mano en una lista sería ofrecer al equipo que
 * peleara con un cálculo del servidor, y el servidor gana: de una parada
 * por impago se sale cobrando.
 *
 * Quedan los tres que sí son una decisión de alguien: archivar, reactivar y
 * registrar la baja que llegó por teléfono. Cada uno con su motivo, que la
 * pantalla exige aunque la función lo admita vacío — dentro de seis meses
 * alguien preguntará por qué, y un motivo en blanco no responde.
 */
export function ServiceStatusForms({
  establishmentId,
  status,
}: {
  establishmentId: string;
  status: string;
}) {
  const archivado = status === "archived";
  const dandoseDeBaja = status === "ending";
  const sinServicio = status === "suspended" || archivado;

  return (
    <div className="space-y-4">
      {archivado ? (
        <ReactivateForm establishmentId={establishmentId} />
      ) : (
        <ArchiveForm establishmentId={establishmentId} />
      )}

      {/*
        M47 · la baja que llegó por fuera. No se ofrece cuando ya está
        comunicada —no hay nada que volver a decir— ni cuando el restaurante
        ya no tiene servicio: no se da de baja lo que ya acabó. En los dos
        casos se dice el motivo, no se esconde la tarjeta.
      */}
      <Card title={t.serviceTerminationTitle}>
        {dandoseDeBaja ? (
          <p className="text-sm text-text-secondary">{t.serviceTerminationAlready}</p>
        ) : sinServicio ? (
          <p className="text-sm text-text-secondary">{t.serviceTerminationNoService}</p>
        ) : (
          <TerminationForm establishmentId={establishmentId} />
        )}
      </Card>
    </div>
  );
}

function ArchiveForm({ establishmentId }: { establishmentId: string }) {
  const [state, action, pending] = useActionState(archiveEstablishment, INITIAL_SERVICE_STATUS);

  return (
    <Card title={t.serviceArchiveTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="establishmentId" value={establishmentId} />
        <p className="text-sm text-text-secondary">{t.serviceArchiveHint}</p>
        <TextArea label={t.serviceReasonLabel} name="reason" rows={2} required />
        <Feedback state={state} />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? t.servicePending : t.serviceArchiveSubmit}
        </Button>
      </form>
    </Card>
  );
}

function ReactivateForm({ establishmentId }: { establishmentId: string }) {
  const [state, action, pending] = useActionState(reactivateEstablishment, INITIAL_SERVICE_STATUS);

  return (
    <Card title={t.serviceReactivateTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="establishmentId" value={establishmentId} />
        <p className="text-sm text-text-secondary">{t.serviceReactivateHint}</p>
        <TextArea label={t.serviceReasonLabel} name="reason" rows={2} required />
        <Feedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? t.servicePending : t.serviceReactivateSubmit}
        </Button>
      </form>
    </Card>
  );
}

function TerminationForm({ establishmentId }: { establishmentId: string }) {
  const [state, action, pending] = useActionState(
    registerTerminationFromOutside,
    INITIAL_SERVICE_STATUS,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <p className="text-sm text-text-secondary">{t.serviceTerminationHint}</p>
      <TextArea label={t.serviceReasonLabel} name="reason" rows={2} required />
      <Feedback state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.servicePending : t.serviceTerminationSubmit}
      </Button>
    </form>
  );
}
