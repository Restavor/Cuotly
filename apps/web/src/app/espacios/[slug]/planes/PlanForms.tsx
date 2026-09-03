"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_PLANS } from "./action-state";
import {
  assignPlan,
  cancelScheduledPlanChange,
  contractService,
  previewPlanChange,
  schedulePlanChange,
  upgradePlanNow,
} from "./actions";

/**
 * HU-07 · los formularios de planes y servicios.
 *
 * Cada formulario tiene **una** acción y nada más. Es a propósito: un
 * `<form>` con varios botones que disparan acciones distintas es donde se
 * cuelan los "no pasa nada" —el fallo que costó cuatro revisiones en el
 * CA-19— y aquí el precio de equivocarse es un cobro.
 *
 * Por eso la mejora inmediata son dos pasos: primero se pide el prorrateo
 * (que no escribe nada) y solo cuando el servidor ha dicho cuánto es
 * aparece el botón que cobra.
 *
 * Se pintan solo a quien tiene `manage_clients`, pero eso es cortesía: cada
 * función del servidor lo comprueba, así que enviar el formulario con otra
 * sesión —o llamar a la RPC directamente— falla igual.
 */

type PlanOption = { readonly id: string; readonly name: string; readonly priceCents: number };

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function opciones(planes: readonly PlanOption[]) {
  return planes.map((p) => ({ value: p.id, label: `${p.name} · ${euros(p.priceCents)}` }));
}

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

/** RN-COM-04 · asignar el primer plan abre ciclo y permanencia. */
export function AssignPlanForm({
  establishmentId,
  plans,
}: {
  establishmentId: string;
  plans: readonly PlanOption[];
}) {
  const [state, action, pending] = useActionState(assignPlan, INITIAL_PLANS);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <p className="text-sm text-text-secondary">{es.plansPage.assignPlanHint}</p>
      <Select label={es.plansPage.planLabel} name="planId" required options={opciones(plans)} />
      <Button type="submit" disabled={pending}>
        {pending ? es.plansPage.assignPlanPending : es.plansPage.assignPlanSubmit}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.plansPage.assignPlanDone} />
    </form>
  );
}

/**
 * RN-COM-15 · la mejora inmediata, en dos pasos. El primero solo pregunta
 * (`plan_change_preview()` es una lectura); el segundo es el que cobra, y
 * no existe hasta que la cifra está en pantalla.
 */
export function UpgradeNowForms({
  subscriptionId,
  plans,
}: {
  subscriptionId: string;
  plans: readonly PlanOption[];
}) {
  const [state, action, pending] = useActionState(previewPlanChange, INITIAL_PLANS);
  const [confirmState, confirmAction, confirmPending] = useActionState(
    upgradePlanNow,
    INITIAL_PLANS,
  );

  const preview = state.preview;
  const extras = preview
    ? ([
        [es.naming.categories.small, preview.extraSmall],
        [es.naming.categories.photo, preview.extraPhoto],
        [es.naming.categories.medium, preview.extraMedium],
        [es.naming.categories.large, preview.extraLarge],
      ] as const).filter(([, cantidad]) => cantidad > 0)
    : [];

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-2">
        <input type="hidden" name="subscriptionId" value={subscriptionId} />
        <Select label={es.plansPage.targetPlanLabel} name="planId" required options={opciones(plans)} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? es.plansPage.previewPending : es.plansPage.previewSubmit}
        </Button>
        <Aviso error={state.error} done={false} hecho="" />
      </form>

      {preview ? (
        <div className="rounded-[10px] border border-border bg-background p-4">
          <p className="text-sm font-semibold text-primary-dark">{es.plansPage.previewTitle}</p>
          <p className="text-sm text-text-secondary">
            {es.plansPage.previewDifference} <strong>{euros(preview.differenceCents)}</strong>{" "}
            {es.plansPage.previewFraction} ({preview.fractionPercent} %).
          </p>
          {extras.length === 0 ? (
            <p className="text-sm text-text-secondary">{es.plansPage.previewNoExtras}</p>
          ) : (
            <p className="text-sm text-text-secondary">
              {es.plansPage.previewExtras}{" "}
              {extras.map(([nombre, cantidad]) => `${nombre}: +${cantidad}`).join(" · ")}
            </p>
          )}

          <form action={confirmAction} className="mt-3 space-y-2">
            <input type="hidden" name="subscriptionId" value={subscriptionId} />
            <input type="hidden" name="planId" value={preview.targetPlanId} />
            <Button type="submit" disabled={confirmPending}>
              {confirmPending ? es.plansPage.upgradeNowPending : es.plansPage.upgradeNowSubmit}
            </Button>
            <Aviso
              error={confirmState.error}
              done={confirmState.done}
              hecho={es.plansPage.upgradeNowDone}
            />
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** RN-COM-16 y RN-COM-17 · el cambio que espera a la renovación. */
export function SchedulePlanChangeForm({
  subscriptionId,
  plans,
}: {
  subscriptionId: string;
  plans: readonly PlanOption[];
}) {
  const [state, action, pending] = useActionState(schedulePlanChange, INITIAL_PLANS);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Select label={es.plansPage.targetPlanLabel} name="planId" required options={opciones(plans)} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.plansPage.schedulePending : es.plansPage.scheduleSubmit}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.plansPage.scheduleDone} />
    </form>
  );
}

/** Anular el cambio programado: queda como anulado, no se borra. */
export function CancelScheduledChangeForm({ subscriptionId }: { subscriptionId: string }) {
  const [state, action, pending] = useActionState(cancelScheduledPlanChange, INITIAL_PLANS);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Field label={es.plansPage.cancelScheduledReasonLabel} name="reason" type="text" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.plansPage.cancelScheduledPending : es.plansPage.cancelScheduledSubmit}
      </Button>
      <p className="text-sm text-text-secondary">{es.plansPage.cancelScheduledHint}</p>
      <Aviso error={state.error} done={state.done} hecho={es.plansPage.cancelScheduledDone} />
    </form>
  );
}

/** RN-COM-11 y RN-COM-13 · contratar un servicio adicional. */
export function ContractServiceForm({
  establishmentId,
  services,
}: {
  establishmentId: string;
  services: readonly PlanOption[];
}) {
  const [state, action, pending] = useActionState(contractService, INITIAL_PLANS);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <Select
        label={es.plansPage.serviceLabel}
        name="serviceId"
        required
        options={opciones(services)}
      />
      <Button type="submit" disabled={pending}>
        {pending ? es.plansPage.contractServicePending : es.plansPage.contractServiceSubmit}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.plansPage.contractServiceDone} />
    </form>
  );
}
