"use client";

import { useActionState, useId } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SETTINGS } from "../action-state";
import { archiveSpace, restoreSpace, transferOwnership } from "./actions";

export interface TransferCandidate {
  readonly userId: string;
  readonly label: string;
}

function Mensaje({ error, done, texto }: { error: string | null; done: boolean; texto: string }) {
  if (error) {
    return (
      <p role="alert" className="mt-3 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="mt-3 text-sm text-success">
        {texto}
      </p>
    );
  }
  return null;
}

/**
 * RN-CIC-05 · transferir la propiedad. La lista solo trae miembros
 * activos del espacio: a quien no está dentro se le invita, y eso es otra
 * cosa (HU-03). Que la lista esté bien no es el control: lo vuelve a
 * comprobar `transfer_space_ownership()`.
 *
 * §140 · la confirmación adicional es escribir el nombre del espacio.
 */
export function TransferOwnershipForm({
  spaceId,
  spaceName,
  candidates,
}: {
  spaceId: string;
  spaceName: string;
  candidates: readonly TransferCandidate[];
}) {
  const [state, action, pending] = useActionState(transferOwnership, INITIAL_SETTINGS);
  const key = useId();
  const t = es.spaceOwnership;

  if (candidates.length === 0) {
    return <p className="text-sm text-text-secondary">{t.noCandidates}</p>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="spaceName" value={spaceName} />
      <input type="hidden" name="idempotencyKey" value={`transfer:${key}`} />
      <Select
        name="toUserId"
        label={t.transferTo}
        options={candidates.map((c) => ({ value: c.userId, label: c.label }))}
      />
      <TextArea name="reason" label={t.transferReason} rows={2} />
      <Field name="confirmation" label={t.confirmationLabel(spaceName)} required />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t.transferPending : t.transferSubmit}
      </Button>
      <Mensaje error={state.error} done={state.done} texto={t.transferDone} />
    </form>
  );
}

/** RN-CIC-07 · archivar. El motivo es obligatorio y §140 pide confirmar. */
export function ArchiveSpaceForm({
  spaceId,
  spaceName,
}: {
  spaceId: string;
  spaceName: string;
}) {
  const [state, action, pending] = useActionState(archiveSpace, INITIAL_SETTINGS);
  const key = useId();
  const t = es.spaceOwnership;

  return (
    <form action={action}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="spaceName" value={spaceName} />
      <input type="hidden" name="idempotencyKey" value={`archive:${key}`} />
      <TextArea name="reason" label={t.archiveReason} rows={2} required />
      <Field name="confirmation" label={t.confirmationLabel(spaceName)} required />
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? t.archivePending : t.archiveSubmit}
      </Button>
      <Mensaje error={state.error} done={state.done} texto={t.archiveDone} />
    </form>
  );
}

/** RN-CIC-08 · restaurar, dentro de los 30 días. */
export function RestoreSpaceForm({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState(restoreSpace, INITIAL_SETTINGS);
  const key = useId();
  const t = es.spaceOwnership;

  return (
    <form action={action}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="idempotencyKey" value={`restore:${key}`} />
      <TextArea name="reason" label={t.restoreReason} rows={2} />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t.restorePending : t.restoreSubmit}
      </Button>
      <Mensaje error={state.error} done={state.done} texto={t.restoreDone} />
    </form>
  );
}
