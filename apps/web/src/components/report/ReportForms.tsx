"use client";

/**
 * Los formularios de los informes (§95). Son lo único que necesita ser
 * cliente: el resto de las pantallas se pinta en el servidor.
 *
 * Ninguno decide si puede: enseñan lo que tiene sentido enseñar y el
 * servidor vuelve a comprobarlo (migración 85). Si un botón se colara, la
 * llamada respondería que no — que es la diferencia entre ocultar y
 * cerrar (CLAUDE.md).
 */

import { useActionState } from "react";

import {
  createReport,
  regenerateReport,
  renameReport,
  saveReportSections,
  scheduleReport,
  sendReport,
  setReportStatus,
} from "@/app/espacios/[slug]/informes/actions";
import {
  type ReportActionState,
  IDLE_REPORT_ACTION,
} from "@/app/espacios/[slug]/informes/action-state";
import { Button, Field, Select, TextArea } from "@/components/ui";
import {
  REPORT_CATEGORIES,
  type ReportPeriod,
  type ReportSectionKey,
  type ReportState,
  sectionRequiresJudgement,
} from "@/core/reports";
import { es } from "@/i18n/es";

const t = es.reportsPage;

export interface EstablishmentOption {
  readonly id: string;
  readonly name: string;
}

function Aviso({ state }: { state: ReportActionState }) {
  if (state.blockedByOpportunities !== null) {
    return (
      <p role="status" className="rounded-[10px] bg-soft-surface p-3 text-sm text-text">
        {t.blockedByOpportunities(state.blockedByOpportunities)}
      </p>
    );
  }
  return state.error ? (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  ) : null;
}

/**
 * §93 · los seis filtros de la maqueta 10.01: restaurante, grupo, plan,
 * periodo, categoría y estado. Van por la dirección y no por estado del
 * componente, así que una búsqueda se comparte con un enlace y el botón
 * "atrás" hace lo que se espera.
 */
export function ReportFilters({
  base,
  establishments,
  groups,
  plans,
  selected,
}: {
  base: string;
  establishments: readonly EstablishmentOption[];
  groups: readonly EstablishmentOption[];
  plans: readonly EstablishmentOption[];
  selected: {
    readonly establishmentId: string | null;
    readonly groupId: string | null;
    readonly planId: string | null;
    readonly category: string | null;
    readonly status: string | null;
    readonly from: string | null;
    readonly to: string | null;
  };
}) {
  return (
    <form action={base} method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* M68 · la biblioteca es la pestaña "Informes generados": filtrar no
          debe sacar de ella aunque todos los filtros vayan vacíos. */}
      <input type="hidden" name="tab" value="generados" />
      <Select
        name="restaurante"
        label={t.filters.establishment}
        defaultValue={selected.establishmentId ?? ""}
        options={[
          { value: "", label: t.filters.allEstablishments },
          ...establishments.map((row) => ({ value: row.id, label: row.name })),
        ]}
      />
      <Select
        name="grupo"
        label={t.filters.group}
        defaultValue={selected.groupId ?? ""}
        options={[
          { value: "", label: t.filters.allGroups },
          ...groups.map((row) => ({ value: row.id, label: row.name })),
        ]}
      />
      <Select
        name="plan"
        label={t.filters.plan}
        defaultValue={selected.planId ?? ""}
        options={[
          { value: "", label: t.filters.allPlans },
          ...plans.map((row) => ({ value: row.id, label: row.name })),
        ]}
      />
      <Select
        name="categoria"
        label={t.filters.category}
        defaultValue={selected.category ?? ""}
        options={[
          { value: "", label: t.filters.allCategories },
          ...REPORT_CATEGORIES.map((category) => ({ value: category, label: t.categories[category] })),
        ]}
      />
      <Select
        name="estado"
        label={t.filters.state}
        defaultValue={selected.status ?? ""}
        options={[
          { value: "", label: t.filters.allStates },
          ...(Object.keys(t.states) as ReportState[]).map((state) => ({
            value: state,
            label: t.states[state],
          })),
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field name="desde" type="date" label={t.filters.from} defaultValue={selected.from ?? ""} />
        <Field name="hasta" type="date" label={t.filters.to} defaultValue={selected.to ?? ""} />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" variant="secondary">
          {t.filters.apply}
        </Button>
      </div>
    </form>
  );
}

/** §95.1 y §95.2 · preparar el borrador. */
export function CreateReportForm({
  slug,
  period,
  establishments,
}: {
  slug: string;
  period: ReportPeriod;
  establishments: readonly EstablishmentOption[];
}) {
  const [state, action, pending] = useActionState(createReport, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <Field name="name" label={t.nameLabel} required maxLength={120} />
      <Select
        name="category"
        label={t.columns.category}
        options={REPORT_CATEGORIES.map((category) => ({
          value: category,
          label: t.categories[category],
        }))}
      />
      <Select
        name="establishmentId"
        label={t.filters.establishment}
        options={[
          { value: "", label: t.pdf.consolidated },
          ...establishments.map((row) => ({ value: row.id, label: row.name })),
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field name="periodStart" type="date" label={t.filters.period} defaultValue={period.start} />
        <Field name="periodEnd" type="date" label={t.columns.period} defaultValue={period.end} />
      </div>
      <div className="sm:col-span-2 space-y-2">
        <Aviso state={state} />
        <Button type="submit" disabled={pending}>
          {t.create}
        </Button>
      </div>
    </form>
  );
}

/** §95.5 · seleccionar, editar y ordenar las secciones. */
export function SectionsForm({
  slug,
  reportId,
  sections,
  readOnly,
}: {
  slug: string;
  reportId: string;
  sections: readonly { readonly key: ReportSectionKey; readonly included: boolean; readonly note: string | null }[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(saveReportSections, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />

      {sections.map((section) => (
        <div key={section.key} className="rounded-[10px] border border-border p-3">
          <input type="hidden" name="sectionKey" value={section.key} />
          <label className="flex items-center gap-2 text-sm font-semibold text-text">
            <input
              type="checkbox"
              name={`included:${section.key}`}
              defaultChecked={section.included}
              disabled={readOnly}
            />
            {t.sections[section.key]}
            {sectionRequiresJudgement(section.key) ? (
              <span className="rounded-full bg-soft-surface px-2 py-0.5 text-xs font-semibold text-text-secondary">
                {t.judgementBadge}
              </span>
            ) : null}
          </label>

          <p className="mt-1 text-xs text-text-secondary">{t.sectionHints[section.key]}</p>

          {sectionRequiresJudgement(section.key) ? (
            <>
              <p className="mt-2 text-xs text-text-secondary">{t.judgementHint}</p>
              {section.key === "executive_summary" ? (
                <TextArea
                  name={`note:${section.key}`}
                  label={t.sections[section.key]}
                  defaultValue={section.note ?? ""}
                  rows={3}
                  disabled={readOnly}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ))}

      <Aviso state={state} />
      {readOnly ? null : (
        <Button type="submit" disabled={pending}>
          {es.common.save}
        </Button>
      )}
    </form>
  );
}

/** Un cambio de estado de §95 con su botón. El motivo solo donde hace falta. */
export function StatusButton({
  slug,
  reportId,
  status,
  label,
  needsReason = false,
  variant = "primary",
}: {
  slug: string;
  reportId: string;
  status: ReportState;
  label: string;
  needsReason?: boolean;
  variant?: "primary" | "secondary";
}) {
  const [state, action, pending] = useActionState(setReportStatus, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="status" value={status} />
      {needsReason ? <Field name="reason" label={t.archiveReason} required maxLength={200} /> : null}
      <Aviso state={state} />
      <Button type="submit" variant={variant} disabled={pending}>
        {label}
      </Button>
    </form>
  );
}

/** §95.7 · programar el envío (vista 10.04, bloque "Programar envío"). */
export function ScheduleForm({
  slug,
  reportId,
  scheduledFor,
  includeCsv,
  channel,
}: {
  slug: string;
  reportId: string;
  scheduledFor: string | null;
  includeCsv: boolean;
  channel: string;
}) {
  const [state, action, pending] = useActionState(scheduleReport, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />
      <Field
        name="scheduledFor"
        type="datetime-local"
        label={t.scheduleDate}
        defaultValue={scheduledFor ? scheduledFor.slice(0, 16) : ""}
      />
      <Select
        name="channel"
        label={t.scheduleChannel}
        defaultValue={channel}
        options={[
          { value: "email", label: t.scheduleChannel },
          { value: "none", label: t.scheduleNoChannel },
        ]}
      />
      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" name="includeCsv" defaultChecked={includeCsv} />
        {t.includeCsv}
      </label>
      <Aviso state={state} />
      <Button type="submit" disabled={pending}>
        {t.schedule}
      </Button>
    </form>
  );
}

/** §95.7 · enviar ahora, con el freno de §95 dicho con sus palabras. */
export function SendButton({ slug, reportId }: { slug: string; reportId: string }) {
  const [state, action, pending] = useActionState(sendReport, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />
      <Aviso state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {t.sendNow}
      </Button>
    </form>
  );
}

/** Volver a calcular: añade una versión, no pisa la anterior (RN-REP-12). */
export function RegenerateButton({ slug, reportId }: { slug: string; reportId: string }) {
  const [state, action, pending] = useActionState(regenerateReport, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />
      <Aviso state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {t.regenerate}
      </Button>
    </form>
  );
}

export function RenameForm({
  slug,
  reportId,
  name,
  readOnly,
}: {
  slug: string;
  reportId: string;
  name: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(renameReport, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />
      <Field name="name" label={t.nameLabel} defaultValue={name} disabled={readOnly} maxLength={120} />
      <Aviso state={state} />
      {readOnly ? null : (
        <Button type="submit" variant="secondary" disabled={pending}>
          {es.common.save}
        </Button>
      )}
    </form>
  );
}
