"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_PLANS, INITIAL_TERMS } from "./action-state";
import {
  assignPlan,
  cancelScheduledPlanChange,
  contractService,
  publishConditions,
  recordExternalAcceptance,
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
 * Por eso la mejora inmediata son dos pasos: la ficha (M56) pide primero
 * el prorrateo al servidor (que no escribe nada) y solo cuando la cifra
 * está en pantalla aparece el botón que cobra.
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

/**
 * Maqueta 13 · publicar una versión nueva de las condiciones de un plan o
 * servicio (RN-DAT-07). El texto se manda entero: no hay "editar la
 * versión vigente", porque hay restaurantes que la aceptaron tal cual.
 */
export function PublishConditionsForm({
  subjectType,
  subjectId,
}: {
  subjectType: "plan" | "service";
  subjectId: string;
}) {
  const [state, action, pending] = useActionState(publishConditions, INITIAL_TERMS);
  const t = es.plansPage.terms;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <TextArea label={t.publishLabel} name="conditions" rows={8} required hint={t.publishHint} />
      <Button type="submit" disabled={pending}>
        {pending ? t.publishPending : t.publishSubmit}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={t.publishDone} />
    </form>
  );
}

/**
 * Maqueta 13 · opción (b): el equipo registra una aceptación de fuera.
 * La fecha propuesta es "hoy" en la zona del ESPACIO, calculada en el
 * servidor y recibida aquí — el navegador de quien registra puede estar
 * en otro huso (CLAUDE.md MUST). El contrato se elige entre los archivos
 * del restaurante: sin archivos no hay formulario, hay un motivo.
 */
export function RecordExternalAcceptanceForm({
  subscriptionId,
  versionId,
  today,
  files,
}: {
  subscriptionId: string;
  versionId: string;
  today: string;
  files: readonly { readonly id: string; readonly name: string }[];
}) {
  const [state, action, pending] = useActionState(recordExternalAcceptance, INITIAL_TERMS);
  const t = es.plansPage.terms;

  if (files.length === 0) {
    return <p className="text-sm text-text-secondary">{t.recordFileNone}</p>;
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="versionId" value={versionId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label={t.recordDateLabel} name="acceptedOn" type="date" defaultValue={today} max={today} required />
        </div>
        <div className="w-72">
          <Select
            label={t.recordFileLabel}
            name="fileId"
            required
            options={files.map((file) => ({ value: file.id, label: file.name }))}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t.recordPending : t.recordSubmit}
        </Button>
      </div>
      <Aviso error={state.error} done={state.done} hecho={t.recordDone} />
    </form>
  );
}

/**
 * M56 · confirmar un cambio de plan ya elegido en la comparativa. Un
 * formulario por camino, con el plan destino fijo: la mejora inmediata
 * cobra (RN-COM-15) y la programada espera a la renovación (RN-COM-16 y
 * 17). En la inmediata, la cifra la ha calculado el servidor antes de
 * pintar este botón (`plan_change_preview()`), así que se confirma lo que
 * se está viendo. La casilla es la del dibujo: el botón no se habilita
 * hasta marcarla.
 */
export function ConfirmPlanChangeForm({
  subscriptionId,
  planId,
  mode,
}: {
  subscriptionId: string;
  planId: string;
  mode: "now" | "renewal";
}) {
  const [state, action, pending] = useActionState(mode === "now" ? upgradePlanNow : schedulePlanChange, INITIAL_PLANS);
  const [revisado, setRevisado] = useState(false);
  const t = es.plansPage;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="planId" value={planId} />
      <Button type="submit" disabled={pending || !revisado} className="w-full">
        {mode === "now"
          ? pending
            ? t.upgradeNowPending
            : t.upgradeNowSubmit
          : pending
            ? t.schedulePending
            : t.scheduleSubmit}
      </Button>
      <label className="flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={revisado}
          onChange={(e) => setRevisado(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-cuotly-green"
        />
        {t.change.reviewed}
      </label>
      <Aviso
        error={state.error}
        done={state.done}
        hecho={mode === "now" ? t.upgradeNowDone : t.scheduleDone}
      />
    </form>
  );
}

/** M56 · "Seleccionar restaurante": cambia de ficha sin perder la pestaña. */
export function RestaurantSwitcher({
  slug,
  current,
  restaurants,
}: {
  slug: string;
  current: string;
  restaurants: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <Select
      label={es.plansPage.change.restaurantLabel}
      name="restaurante"
      defaultValue={current}
      options={restaurants.map((r) => ({ value: r.id, label: r.name }))}
      onChange={(e) => router.push(`/espacios/${slug}/planes/${e.target.value}`)}
    />
  );
}
