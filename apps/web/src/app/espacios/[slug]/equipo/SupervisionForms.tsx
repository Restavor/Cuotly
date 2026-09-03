"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_TEAM } from "./action-state";
import {
  rescheduleSubstitute,
  revokeSupervision,
  setPrincipalSupervisor,
  setSubstituteSupervisor,
} from "./actions";

/**
 * HU-29 · los formularios de supervisión. Solo se pintan a quien tiene
 * `manage_space`, pero eso es cortesía: RN-SUP-05 lo hace cumplir cada
 * función del servidor, así que enviar el formulario con otra sesión —o
 * llamar a la RPC directamente— falla igual.
 */

type Persona = { id: string; name: string };

function Aviso({ error, done, hecho }: { error: string | null; done: boolean; hecho: string }) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-text-secondary">
          {hecho}
        </p>
      ) : null}
    </>
  );
}

function opciones(personas: readonly Persona[]) {
  return personas.map((p) => ({ value: p.id, label: p.name }));
}

/** RN-SUP-02 · exactamente un administrador principal por trabajador. */
export function PrincipalSupervisorForm({
  spaceId,
  workers,
  admins,
}: {
  spaceId: string;
  workers: readonly Persona[];
  admins: readonly Persona[];
}) {
  const [state, action, pending] = useActionState(setPrincipalSupervisor, INITIAL_TEAM);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className="flex flex-wrap gap-3">
        <div className="min-w-52 flex-1">
          <Select label={es.teamPage.workerLabel} name="workerId" required options={opciones(workers)} />
        </div>
        <div className="min-w-52 flex-1">
          <Select label={es.teamPage.adminLabel} name="adminId" required options={opciones(admins)} />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? es.teamPage.setPrincipalPending : es.teamPage.setPrincipal}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.teamPage.setPrincipalDone} />
    </form>
  );
}

/** RN-SUP-03 · sustituto temporal con fecha de inicio y de fin. */
export function SubstituteSupervisorForm({
  spaceId,
  workers,
  admins,
  defaultDay,
}: {
  spaceId: string;
  workers: readonly Persona[];
  admins: readonly Persona[];
  defaultDay: string;
}) {
  const [state, action, pending] = useActionState(setSubstituteSupervisor, INITIAL_TEAM);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className="flex flex-wrap gap-3">
        <div className="min-w-52 flex-1">
          <Select label={es.teamPage.workerLabel} name="workerId" required options={opciones(workers)} />
        </div>
        <div className="min-w-52 flex-1">
          <Select label={es.teamPage.adminLabel} name="adminId" required options={opciones(admins)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-40 flex-1">
          <Field
            label={es.teamPage.substituteStartLabel}
            name="startsAt"
            type="date"
            defaultValue={defaultDay}
            required
          />
        </div>
        <div className="min-w-40 flex-1">
          <Field
            label={es.teamPage.substituteEndLabel}
            name="endsAt"
            type="date"
            defaultValue={defaultDay}
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? es.teamPage.setSubstitutePending : es.teamPage.setSubstitute}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.teamPage.setSubstituteDone} />
    </form>
  );
}

/**
 * RN-SUP-03 · "puede retirarse antes o ampliarse". Las dos cosas caben en
 * este formulario: acortar la fecha de fin la retira antes, alargarla la
 * amplía. Retirarla del todo es el botón de al lado.
 */
export function SupervisionRowActions({
  supervisionId,
  canReschedule,
  defaultDay,
}: {
  supervisionId: string;
  canReschedule: boolean;
  defaultDay: string;
}) {
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState(
    rescheduleSubstitute,
    INITIAL_TEAM,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(revokeSupervision, INITIAL_TEAM);

  return (
    <div className="space-y-3">
      {canReschedule ? (
        <form action={rescheduleAction} className="space-y-2">
          <input type="hidden" name="supervisionId" value={supervisionId} />
          <div className="max-w-52">
            <Field
              label={es.teamPage.rescheduleLabel}
              name="endsAt"
              type="date"
              defaultValue={defaultDay}
              required
            />
          </div>
          <Button type="submit" variant="secondary" disabled={reschedulePending}>
            {es.teamPage.reschedule}
          </Button>
          <Aviso
            error={rescheduleState.error}
            done={rescheduleState.done}
            hecho={es.teamPage.rescheduleDone}
          />
        </form>
      ) : null}

      <form action={revokeAction} className="space-y-2">
        <input type="hidden" name="supervisionId" value={supervisionId} />
        <TextArea label={es.teamPage.revokeReasonLabel} name="reason" rows={2} maxLength={300} />
        <p className="text-sm text-text-secondary">{es.teamPage.revokeHint}</p>
        <Button type="submit" variant="danger" disabled={revokePending}>
          {es.teamPage.revoke}
        </Button>
        <Aviso error={revokeState.error} done={revokeState.done} hecho={es.teamPage.revokeDone} />
      </form>
    </div>
  );
}
