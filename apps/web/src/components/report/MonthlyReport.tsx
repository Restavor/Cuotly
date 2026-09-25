"use client";

/**
 * El informe del mes desde la ficha del restaurante (decisión 78,
 * RN-REP-27 a RN-REP-30): generar, subir con su alerta y reescribir los
 * textos del relato del mes.
 *
 * **Ningún botón de aquí autoriza nada.** Quién genera, quién sube y si
 * hace falta confirmar lo deciden `create_report_draft()`,
 * `publish_report()` y `set_report_entry_texts()` en la base: llamarlas a
 * mano con otra sesión falla igual (CLAUDE.md, ocultar no es controlar).
 */

import { useActionState, useState } from "react";

import {
  generateMonthlyReport,
  publishReport,
  saveReportTexts,
} from "@/app/espacios/[slug]/informes/actions";
import { type ReportActionState, IDLE_REPORT_ACTION } from "@/app/espacios/[slug]/informes/action-state";
import { Button, ButtonLink, Field, TextArea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { es } from "@/i18n/es";

const t = es.reportsPage;

function Aviso({ state, done }: { state: ReportActionState; done?: string }) {
  if (state.blockedByOpportunities !== null) {
    return (
      <p role="status" className="rounded-[10px] bg-soft-surface p-3 text-sm text-text">
        {t.blockedByOpportunities(state.blockedByOpportunities)}
      </p>
    );
  }
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  return state.done && done ? (
    <p role="status" className="text-sm text-text-secondary">
      {done}
    </p>
  ) : null;
}

/** RN-REP-27 · "Generar informe", o "Volver a generar" si ya hay uno. */
export function GenerateMonthlyButton({
  slug,
  establishmentId,
  again,
}: {
  slug: string;
  establishmentId: string;
  again: boolean;
}) {
  const [state, action, pending] = useActionState(generateMonthlyReport, IDLE_REPORT_ACTION);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <Button type="submit" variant={again ? "secondary" : "primary"} pending={pending}>
        {pending ? t.monthly.generating : again ? t.monthly.regenerate : t.monthly.generate}
      </Button>
      {again ? <p className="text-xs text-text-secondary">{t.monthly.regenerateHint}</p> : null}
      <Aviso state={state} />
    </form>
  );
}

/**
 * RN-REP-29 · "Subir informe". Si ya está aprobado, sube sin preguntar; si
 * nadie lo aprobó, pide confirmación: "Subir sin revisar" o "Cancelar y
 * revisar". La confirmación viaja al servidor, que es quien la exige.
 */
export function PublishReportButton({
  slug,
  reportId,
  reviewed,
  reviewHref,
}: {
  slug: string;
  reportId: string;
  reviewed: boolean;
  reviewHref: string;
}) {
  const [state, action, pending] = useActionState(publishReport, IDLE_REPORT_ACTION);
  const [preguntando, setPreguntando] = useState(false);

  const campos = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />
    </>
  );

  return (
    <div className="space-y-2">
      {reviewed ? (
        <form action={action}>
          {campos}
          <input type="hidden" name="confirmUnreviewed" value="false" />
          <Button type="submit" pending={pending}>
            {pending ? t.monthly.publishing : t.monthly.publish}
          </Button>
        </form>
      ) : (
        <Button type="button" onClick={() => setPreguntando(true)} pending={pending}>
          {pending ? t.monthly.publishing : t.monthly.publish}
        </Button>
      )}

      <Modal open={preguntando && !state.done} title={t.monthly.confirmTitle} onClose={() => setPreguntando(false)}>
        <p className="text-sm text-text">{t.monthly.confirmBody}</p>
        <form action={action} className="mt-5 flex flex-wrap justify-end gap-2">
          {campos}
          <input type="hidden" name="confirmUnreviewed" value="true" />
          <ButtonLink href={reviewHref} variant="secondary">
            {t.monthly.confirmReview}
          </ButtonLink>
          <Button type="submit" pending={pending}>
            {t.monthly.confirmPublish}
          </Button>
        </form>
        <div className="mt-3">
          <Aviso state={state} />
        </div>
      </Modal>

      <Aviso state={state} done={t.monthly.published} />
    </div>
  );
}

/** Una cosa del relato, lista para editar. Los originales van al lado. */
export interface EditableChange {
  readonly key: string;
  readonly date: string;
  readonly title: string;
  readonly titleOriginal: string;
  readonly description: string;
  readonly descriptionOriginal: string;
  readonly edited: boolean;
}

export interface EditableEntry {
  readonly key: string;
  readonly date: string;
  readonly text: string;
  readonly textOriginal: string;
  readonly edited: boolean;
}

/**
 * RN-REP-30 · el editor de "Lo que ha pasado este mes". Cada campo lleva
 * al lado su original: si se deja igual o vacío, vuelve a él.
 */
export function EntryTextsForm({
  slug,
  reportId,
  changes,
  entries,
  readOnly,
}: {
  slug: string;
  reportId: string;
  changes: readonly EditableChange[];
  entries: readonly EditableEntry[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(saveReportTexts, IDLE_REPORT_ACTION);

  if (changes.length === 0 && entries.length === 0) {
    return <p className="text-sm text-text-secondary">{t.texts.empty}</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="reportId" value={reportId} />
      <p className="text-sm text-text-secondary">{readOnly ? t.texts.readOnly : t.texts.hint}</p>

      {changes.length > 0 ? (
        <section className="space-y-3">
          <h5 className="text-xs font-semibold text-primary-dark">{t.activity.changesTitle}</h5>
          {changes.map((cambio) => (
            <fieldset key={cambio.key} className="space-y-2 rounded-[10px] border border-border p-3">
              <legend className="flex items-center gap-2 px-1 text-xs text-text-secondary">
                {cambio.date}
                {cambio.edited ? (
                  <span className="rounded-full bg-soft-surface px-2 py-0.5 font-semibold">{t.texts.edited}</span>
                ) : null}
              </legend>
              <input type="hidden" name="entryKey" value={cambio.key} />
              <input type="hidden" name={`titleOriginal:${cambio.key}`} value={cambio.titleOriginal} />
              <input type="hidden" name={`bodyOriginal:${cambio.key}`} value={cambio.descriptionOriginal} />
              <Field
                name={`title:${cambio.key}`}
                label={t.texts.changeTitle}
                defaultValue={cambio.title}
                maxLength={300}
                disabled={readOnly}
              />
              <TextArea
                name={`body:${cambio.key}`}
                label={t.texts.changeDescription}
                defaultValue={cambio.description}
                rows={2}
                maxLength={4000}
                disabled={readOnly}
              />
            </fieldset>
          ))}
        </section>
      ) : null}

      {entries.length > 0 ? (
        <section className="space-y-3">
          <h5 className="text-xs font-semibold text-primary-dark">{t.activity.othersTitle}</h5>
          {entries.map((entrada) => (
            <div key={entrada.key} className="space-y-1">
              <input type="hidden" name="entryKey" value={entrada.key} />
              <input type="hidden" name={`bodyOriginal:${entrada.key}`} value={entrada.textOriginal} />
              <Field
                name={`body:${entrada.key}`}
                label={`${entrada.date} · ${t.texts.entryText}${entrada.edited ? ` (${t.texts.edited})` : ""}`}
                defaultValue={entrada.text}
                maxLength={4000}
                disabled={readOnly}
              />
            </div>
          ))}
        </section>
      ) : null}

      <Aviso state={state} done={t.texts.saved} />
      {readOnly ? null : (
        <Button type="submit" pending={pending}>
          {t.texts.save}
        </Button>
      )}
    </form>
  );
}
