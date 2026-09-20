"use client";

import { useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import {
  type ReportSectionKey,
  type ReportSnapshot,
  figuresOfSection,
  orderedActivity,
  orderedSections,
} from "@/core/reports";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import {
  activitySubject,
  allowanceText,
  changeCategoryText,
  changeDatesText,
  changeText,
  figureLabel,
  figureText,
} from "@/services/report-pdf";

const t = es.reportsPage;

/**
 * Las cifras de una versión, sección a sección. Es la "Vista previa" de
 * la vista 10.04.
 *
 * Una cifra sin valor **dice su motivo** (§178, CA-20): no conectado, sin
 * datos todavía, error, dato desactualizado o periodo insuficiente. Nunca
 * un guion mudo y nunca un dato viejo presentado como actual (RN-REP-07).
 *
 * **Decisión 29 · quién elige qué se ve.** La versión guarda las cifras de
 * las seis secciones, las marcara el equipo o no, así que aquí hay dos
 * elecciones distintas que conviene no confundir:
 *
 *   · La del **equipo**, que son las casillas de "Secciones del informe".
 *     Se guardan en `report_sections`, deciden qué lleva el PDF y el CSV,
 *     y son lo que §95.5 llama "selecciona, edita y ordena".
 *   · La del **lector** —el equipo o el restaurante—, que es este
 *     selector. Es estado de pantalla y no sale de ella: no escribe nada,
 *     no cambia el PDF y no da acceso a nada que la versión no trajera ya
 *     dentro. Por eso puede vivir en el cliente sin romper la regla de
 *     CLAUDE.md: no es un control de acceso, y no hay nada que controlar.
 *
 * Lo que el selector NO ofrece es lo que la versión no trae: las **notas**
 * del equipo de una sección que desmarcó no viajan dentro (RN-REP-13), y
 * las **oportunidades** solo entran si el equipo incluyó su sección (§99).
 * Encender una sección enseña sus cifras, que son datos del restaurante;
 * nunca la redacción interna.
 */

/**
 * §96 · las oportunidades aprobadas que lleva el informe. El título se
 * escribe aquí desde `es.ts` a partir de la regla y el sujeto que guardó
 * la versión: la base no guarda español, y así una aprobada hace dos meses
 * no sigue diciendo una frase que se corrigió después (CLAUDE.md).
 */
function OpportunityList({ snapshot }: { snapshot: ReportSnapshot }) {
  if (snapshot.opportunities.length === 0) {
    return <EmptyReason reason="no_data_yet" title={t.sections.opportunities} />;
  }

  return (
    <ul className="space-y-2">
      {snapshot.opportunities.map((opportunity) => {
        const rule = opportunity.rule as keyof typeof es.opportunities.ruleTitles | null;
        const titulo =
          rule === null
            ? (opportunity.title ?? es.opportunities.title)
            : es.opportunities.ruleTitles[rule](opportunity.subject);
        const impacto = opportunity.impact as keyof typeof es.opportunities.impacts;

        return (
          <li key={opportunity.id} className="rounded-[10px] bg-soft-surface p-3 text-sm">
            <span className="font-semibold text-text">{titulo}</span>
            <span className="ml-2 text-text-secondary">{es.opportunities.impacts[impacto]}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * RN-REP-18 · el relato del mes. Cada fila dice **qué pasó y cuándo**, y
 * nunca quién lo hizo (P7): la versión no trae ninguna identidad del
 * equipo dentro, y aquí tampoco habría de dónde sacarla.
 *
 * Una versión generada **antes** de la migración 112 no trae `activity`.
 * No se recalcula —una versión es el original de su día (RN-REP-12)—: se
 * dice que ese informe no lo trae, que es distinto de "no pasó nada".
 */
function MonthActivity({ snapshot }: { snapshot: ReportSnapshot }) {
  const relato = snapshot.activity;
  if (relato === undefined) {
    return <EmptyReason reason="no_data_yet" title={t.activity.title} />;
  }

  const bolsa = snapshot.allowance ?? [];
  const vacio = bolsa.length === 0 && relato.changes.length === 0 && relato.entries.length === 0;
  if (vacio) {
    return <p className="text-sm text-text-secondary">{t.activity.empty}</p>;
  }

  return (
    <div className="space-y-4">
      {bolsa.length > 0 ? (
        <div className="rounded-[10px] bg-soft-surface p-3">
          <p className="text-xs font-semibold text-primary-dark">{t.allowance.title}</p>
          <ul className="mt-2 space-y-1">
            {bolsa.map((linea) => (
              <li key={linea.category} className="flex flex-wrap justify-between gap-x-4 text-sm">
                <span className="text-text">{es.naming.categoriesPlural[linea.category]}</span>
                <span className="text-text-secondary">
                  {/* RN-REP-20 · con la coletilla que explica el "1 de 0":
                      un presupuestado aparte no consume bolsa (RN-CON-03). */}
                  {allowanceText(linea, t)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {relato.changes.length > 0 ? (
        <section className="space-y-2">
          <h5 className="text-xs font-semibold text-primary-dark">{t.activity.changesTitle}</h5>
          <ol className="space-y-2">
            {relato.changes.map((cambio) => (
              <li key={cambio.code} className="rounded-[10px] bg-soft-surface p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-semibold text-text">{cambio.title ?? cambio.code}</span>
                  <span className="text-xs text-text-secondary">{changeCategoryText(cambio, t)}</span>
                </div>
                {cambio.description ? (
                  <p className="mt-1 text-text-secondary">{cambio.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-text-secondary">{changeDatesText(cambio, t)}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {relato.entries.length > 0 ? (
        <section className="space-y-2">
          <h5 className="text-xs font-semibold text-primary-dark">{t.activity.othersTitle}</h5>
          <ul className="space-y-2">
            {orderedActivity(relato.entries).map((entrada, index) => (
              <li
                key={`${entrada.at}-${entrada.kind}-${index}`}
                className="flex flex-wrap items-baseline gap-x-2 rounded-[10px] bg-soft-surface p-3 text-sm"
              >
                <span className="text-xs text-text-secondary">{fechaCorta(entrada.at)}</span>
                <span className="font-semibold text-text">{t.activity.kinds[entrada.kind]}</span>
                {activitySubject(entrada) ? (
                  <span className="text-text-secondary">{activitySubject(entrada)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Si una sección trae algo dentro de la versión. Una que no trae nada y
 *  que el equipo tampoco incluyó no se ofrece: encenderla solo enseñaría
 *  un motivo de vacío, que es ruido y no información. */
function tieneContenido(snapshot: ReportSnapshot, key: ReportSectionKey): boolean {
  if (key === "opportunities") return snapshot.opportunities.length > 0;
  if (key === "month_activity") {
    return (
      (snapshot.allowance?.length ?? 0) > 0 ||
      (snapshot.activity?.changes.length ?? 0) > 0 ||
      (snapshot.activity?.entries.length ?? 0) > 0
    );
  }
  return figuresOfSection(snapshot, key).length > 0;
}

export function ReportFigures({ snapshot }: { snapshot: ReportSnapshot }) {
  const ordenadas = orderedSections(snapshot.sections);
  // Lo que se puede mirar: lo que el equipo incluyó (aunque venga vacío,
  // porque entonces el motivo del vacío ES la información) más lo que la
  // versión trae aunque el equipo lo dejara fuera.
  const disponibles = ordenadas.filter(
    (section) => section.included || tieneContenido(snapshot, section.key),
  );
  // Al abrir se ve lo mismo que el PDF. El lector decide a partir de ahí.
  const [visibles, setVisibles] = useState<readonly ReportSectionKey[]>(() =>
    ordenadas.filter((section) => section.included).map((section) => section.key),
  );

  function alternar(key: ReportSectionKey): void {
    setVisibles((previas) =>
      previas.includes(key) ? previas.filter((otra) => otra !== key) : [...previas, key],
    );
  }

  const extras = disponibles.filter((section) => !section.included).length > 0;

  return (
    <div className="space-y-6">
      {disponibles.length > 1 ? (
        <div className="rounded-[10px] bg-soft-surface p-3">
          <p className="text-xs font-semibold text-primary-dark">{t.viewSectionsTitle}</p>
          {extras ? <p className="mt-1 text-xs text-text-secondary">{t.viewSectionsHint}</p> : null}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {disponibles.map((section) => (
              <li key={section.key}>
                <label className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={visibles.includes(section.key)}
                    onChange={() => alternar(section.key)}
                  />
                  {t.sections[section.key]}
                  {section.included ? null : (
                    <span className="text-xs text-text-secondary">({t.viewSectionExtra})</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {disponibles
        .filter((section) => visibles.includes(section.key))
        .map((section) => {
          const figures = figuresOfSection(snapshot, section.key);
          const note = snapshot.notes[section.key];

          return (
            <section key={section.key} className="space-y-2">
              <h4 className="text-sm font-semibold text-primary-dark">{t.sections[section.key]}</h4>
              {note ? <p className="text-sm text-text">{note}</p> : null}

              {section.key === "opportunities" ? (
                <OpportunityList snapshot={snapshot} />
              ) : section.key === "month_activity" ? (
                <MonthActivity snapshot={snapshot} />
              ) : figures.length === 0 ? (
                <EmptyReason reason="no_data_yet" title={t.sections[section.key]} />
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t.columns.name}</TableHeaderCell>
                      <TableHeaderCell>{t.columns.period}</TableHeaderCell>
                      <TableHeaderCell>{t.columns.previous}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {figures.map((figure, index) => (
                      <TableRow key={`${figure.metric}-${figure.dimension ?? ""}-${index}`}>
                        <TableCell>{figureLabel(figure, t)}</TableCell>
                        <TableCell>
                          <span className="font-semibold text-text">{figureText(figure, t)}</span>
                          {figure.at ? (
                            <span className="ml-2 text-xs text-text-secondary">{fechaCorta(figure.at)}</span>
                          ) : null}
                        </TableCell>
                        {/* RN-REP-17 · sin comparación la celda va vacía, no
                            con un guion: un guion se lee como "cero". */}
                        <TableCell>
                          <span className="text-sm text-text-secondary">{changeText(figure, t) ?? ""}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          );
        })}
    </div>
  );
}
