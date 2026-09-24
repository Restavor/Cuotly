"use client";

import { useActionState, useState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { REPORT_LEVELS, type PlanTerms, type ServiceTerms } from "@/core/plan-catalogue";
import { es } from "@/i18n/es";

import { INITIAL_PLANS, INITIAL_TERMS } from "./action-state";
import {
  archivePlan,
  archiveService,
  createPlan,
  createService,
  recordRevisionAcceptance,
  renamePlan,
  renameService,
  revisePlan,
  reviseService,
} from "./actions";

/**
 * Decisión 72 · crear, editar, renombrar y archivar planes y servicios.
 *
 * Una acción por formulario, como el resto de Planes: aquí equivocarse es
 * cambiar lo que pagan los restaurantes. Si guardar edita en el sitio o
 * crea una versión nueva no lo decide esta pantalla: lo decide
 * `revise_plan()` según haya o no restaurantes en el plan (RN-COM-20/21);
 * la pantalla solo lo avisa antes con `inUse`.
 *
 * La clave de idempotencia se crea una vez por formulario pintado: pulsar
 * dos veces "Guardar" no crea dos versiones (CLAUDE.md).
 */

const te = es.plansPage.edit;

function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function Aviso({ error, done }: { error: string | null; done: boolean }) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-text-secondary">
          {te.done}
        </p>
      ) : null}
    </>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm text-text">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-cuotly-green" />
      <span>{label}</span>
    </label>
  );
}

function useIdempotencyKey(): string {
  const [key] = useState(() => crypto.randomUUID());
  return key;
}

const EMPTY_PLAN: PlanTerms = {
  priceCents: 0,
  includedSmall: 0,
  includedPhoto: 0,
  includedMedium: 0,
  includedLarge: 0,
  startSlaHours: 48,
  executionSlaSmall: 72,
  executionSlaPhoto: 72,
  executionSlaMedium: 72,
  executionSlaLarge: 120,
  canOrderRequests: false,
  grantsPriority: false,
  queueRank: 0,
  reportLevel: "basic",
  watchesReviews: false,
};

/**
 * RN-COM-19/20 · crear un plan (sin `planId`) o editar lo que se contrata
 * de uno (con `planId`). Con `inUse` > 0 avisa de que nacerá una versión.
 */
export function PlanTermsForm({
  spaceId,
  planId,
  initial,
  inUse,
}: {
  spaceId: string;
  planId: string | null;
  initial: PlanTerms | null;
  inUse: number;
}) {
  const [state, action, pending] = useActionState(planId === null ? createPlan : revisePlan, INITIAL_PLANS);
  const key = useIdempotencyKey();
  const v = initial ?? EMPTY_PLAN;
  const tc = es.plansPage.catalogue;

  return (
    <form action={action} className="space-y-4" aria-label={planId === null ? te.newPlanTitle : te.editPlan}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="idempotencyKey" value={key} suppressHydrationWarning />
      {planId !== null ? <input type="hidden" name="planId" value={planId} /> : null}

      {planId === null ? <Field label={te.nameLabel} name="name" required maxLength={80} /> : null}
      <Field
        label={te.priceLabel}
        name="price"
        inputMode="decimal"
        required
        defaultValue={planId === null ? "" : centsToEuros(v.priceCents)}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-text">{te.includedTitle}</legend>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          <Field label={te.includedSmall} name="includedSmall" type="number" min={0} defaultValue={v.includedSmall} required />
          <Field label={te.includedPhoto} name="includedPhoto" type="number" min={0} defaultValue={v.includedPhoto} required />
          <Field label={te.includedMedium} name="includedMedium" type="number" min={0} defaultValue={v.includedMedium} required />
          <Field label={te.includedLarge} name="includedLarge" type="number" min={0} defaultValue={v.includedLarge} required />
        </div>
      </fieldset>

      <Field label={te.startSlaLabel} name="startSlaHours" type="number" min={1} defaultValue={v.startSlaHours} required />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-text">{te.executionTitle}</legend>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          <Field label={te.includedSmall} name="executionSlaSmall" type="number" min={1} defaultValue={v.executionSlaSmall} required />
          <Field label={te.includedPhoto} name="executionSlaPhoto" type="number" min={1} defaultValue={v.executionSlaPhoto} required />
          <Field label={te.includedMedium} name="executionSlaMedium" type="number" min={1} defaultValue={v.executionSlaMedium} required />
          <Field label={te.includedLarge} name="executionSlaLarge" type="number" min={1} defaultValue={v.executionSlaLarge} required />
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Select
          label={te.reportLevelLabel}
          name="reportLevel"
          defaultValue={v.reportLevel}
          options={REPORT_LEVELS.map((level) => ({ value: level, label: tc.reportLevels[level] }))}
        />
        <Field
          label={te.queueRankLabel}
          name="queueRank"
          type="number"
          defaultValue={v.queueRank}
          hint={te.queueRankHint}
        />
      </div>

      <div className="space-y-2">
        <Check name="canOrderRequests" label={te.canOrderRequests} defaultChecked={v.canOrderRequests} />
        <Check name="grantsPriority" label={te.grantsPriority} defaultChecked={v.grantsPriority} />
        <Check name="watchesReviews" label={te.watchesReviews} defaultChecked={v.watchesReviews} />
      </div>

      {planId !== null ? (
        <p className="rounded-[10px] bg-soft-surface px-4 py-3 text-sm text-text">
          {inUse > 0 ? te.createsVersion(inUse) : te.inPlace}
        </p>
      ) : null}

      <Aviso error={state.error} done={state.done} />
      <Button type="submit" disabled={pending}>
        {pending ? te.saving : planId === null ? te.savePlan : te.saveChanges}
      </Button>
    </form>
  );
}

/** RN-COM-29 · crear un servicio o editar su precio y sus actualizaciones. */
export function ServiceTermsForm({
  spaceId,
  serviceId,
  initial,
  inUse,
}: {
  spaceId: string;
  serviceId: string | null;
  initial: ServiceTerms | null;
  inUse: number;
}) {
  const [state, action, pending] = useActionState(serviceId === null ? createService : reviseService, INITIAL_PLANS);
  const key = useIdempotencyKey();
  const tc = es.plansPage.catalogue;

  return (
    <form action={action} className="space-y-4" aria-label={serviceId === null ? te.newServiceTitle : te.editService}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="idempotencyKey" value={key} suppressHydrationWarning />
      {serviceId !== null ? <input type="hidden" name="serviceId" value={serviceId} /> : null}

      {serviceId === null ? (
        <>
          <Field label={te.nameLabel} name="name" required maxLength={80} />
          <Select
            label={te.kindLabel}
            name="kind"
            defaultValue="other"
            options={[
              { value: "other", label: tc.kindOther },
              { value: "daily_menu", label: tc.kindDailyMenu },
            ]}
          />
        </>
      ) : null}
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Field
          label={te.priceLabel}
          name="price"
          inputMode="decimal"
          required
          defaultValue={initial ? centsToEuros(initial.priceCents) : ""}
        />
        <Field
          label={te.pricePremiumLabel}
          name="pricePremium"
          inputMode="decimal"
          hint={te.pricePremiumHint}
          defaultValue={initial?.pricePremiumCents != null ? centsToEuros(initial.pricePremiumCents) : ""}
        />
      </div>
      <Field
        label={te.updatesLabel}
        name="includedUpdates"
        type="number"
        min={0}
        defaultValue={initial?.includedUpdates ?? 0}
        required
      />

      {serviceId !== null ? (
        <p className="rounded-[10px] bg-soft-surface px-4 py-3 text-sm text-text">
          {inUse > 0 ? te.createsVersion(inUse) : te.inPlace}
        </p>
      ) : null}

      <Aviso error={state.error} done={state.done} />
      <Button type="submit" disabled={pending}>
        {pending ? te.saving : serviceId === null ? te.saveService : te.saveChanges}
      </Button>
    </form>
  );
}

/** RN-COM-20 · el nombre se corrige sin versión. */
export function RenameForm({ kind, id, name }: { kind: "plan" | "service"; id: string; name: string }) {
  const [state, action, pending] = useActionState(kind === "plan" ? renamePlan : renameService, INITIAL_PLANS);
  return (
    <form action={action} className="space-y-2" aria-label={te.renameTitle}>
      <input type="hidden" name={kind === "plan" ? "planId" : "serviceId"} value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <Field label={te.renameTitle} name="name" defaultValue={name} required maxLength={80} hint={te.renameHint} />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? te.saving : te.rename}
        </Button>
      </div>
      <Aviso error={state.error} done={state.done} />
    </form>
  );
}

/** RN-COM-27 · archivar, con una casilla que hay que marcar. */
export function ArchiveForm({ kind, id }: { kind: "plan" | "service"; id: string }) {
  const [state, action, pending] = useActionState(kind === "plan" ? archivePlan : archiveService, INITIAL_PLANS);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form action={action} className="space-y-3" aria-label={te.archiveTitle}>
      <input type="hidden" name={kind === "plan" ? "planId" : "serviceId"} value={id} />
      <p className="text-sm text-text-secondary">{te.archiveHint}</p>
      <label className="flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-cuotly-green"
        />
        <span>{te.archiveConfirm}</span>
      </label>
      <Aviso error={state.error} done={state.done} />
      <Button type="submit" variant="danger" disabled={pending || !confirmed}>
        {te.archive}
      </Button>
    </form>
  );
}

/**
 * RN-COM-23 · el equipo registra que el restaurante aceptó fuera de Cuotly
 * una versión que le perjudica, con la fecha y el contrato. Sin archivos
 * del restaurante no hay formulario: se dice por qué.
 */
export function RecordRevisionAcceptanceForm({
  subscriptionId,
  today,
  files,
}: {
  subscriptionId: string;
  today: string;
  files: readonly { readonly id: string; readonly name: string }[];
}) {
  const [state, action, pending] = useActionState(recordRevisionAcceptance, INITIAL_TERMS);
  const tt = es.plansPage.terms;
  const tr = es.plansPage.revisions;

  if (files.length === 0) {
    return <p className="text-sm text-text-secondary">{tt.recordFileNone}</p>;
  }

  return (
    <form action={action} className="space-y-2" aria-label={tr.recordTitle}>
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label={tt.recordDateLabel} name="acceptedOn" type="date" defaultValue={today} max={today} required />
        </div>
        <div className="w-72">
          <Select
            label={tt.recordFileLabel}
            name="fileId"
            required
            options={files.map((file) => ({ value: file.id, label: file.name }))}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? tt.recordPending : tr.recordSubmit}
        </Button>
      </div>
      <Aviso error={state.error} done={state.done} />
    </form>
  );
}
