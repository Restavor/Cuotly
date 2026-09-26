"use client";

import { useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import {
  type ReportSectionKey,
  type ReportSnapshot,
  changeDescription,
  changeTitle,
  figuresOfSection,
  orderedActivity,
  orderedSections,
} from "@/core/reports";
import { enZona, fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import {
  activitySubject,
  allowanceText,
  changeCategoryText,
  changeDatesText,
  changeText,
  deviceName,
  figureLabel,
  figureText,
  opportunityTitle,
  sectionTitle,
  trafficShare,
  yearAgoText,
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
                  {/* RN-REP-30 · el texto que se lee es el editado si lo hay. */}
                  <span className="font-semibold text-text">{changeTitle(cambio)}</span>
                  <span className="text-xs text-text-secondary">{changeCategoryText(cambio, t)}</span>
                </div>
                {changeDescription(cambio) ? (
                  <p className="mt-1 text-text-secondary">{changeDescription(cambio)}</p>
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
                {entrada.editedText ? (
                  <span className="font-semibold text-text">{entrada.editedText}</span>
                ) : (
                  <>
                    <span className="font-semibold text-text">{t.activity.kinds[entrada.kind]}</span>
                    {activitySubject(entrada) ? (
                      <span className="text-text-secondary">{activitySubject(entrada)}</span>
                    ) : null}
                  </>
                )}
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
  if (key === "web_traffic") {
    const trafico = snapshot.traffic;
    return (
      figuresOfSection(snapshot, key).length > 0 ||
      (trafico !== undefined &&
        (trafico.topPages.length > 0 || trafico.devices.length > 0 || trafico.months.length > 0))
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
                  {sectionTitle(section.key, snapshot.period, t)}
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
              <h4 className="text-sm font-semibold text-primary-dark">
                {sectionTitle(section.key, snapshot.period, t)}
              </h4>
              {note ? <p className="text-sm text-text">{note}</p> : null}
              {/* RN-REP-19, punto 3 · la línea que dice de quién es el resumen. */}
              {section.key === "executive_summary" && note && snapshot.summary ? (
                <p className="text-xs text-text-secondary">
                  {snapshot.summary.auto ? t.autoSummary.autoLine : t.autoSummary.editedLine}
                </p>
              ) : null}

              {section.key === "opportunities" ? (
                <>
                  <OpportunityList snapshot={snapshot} />
                  <FollowUp snapshot={snapshot} />
                </>
              ) : section.key === "month_activity" ? (
                <>
                  <MonthActivity snapshot={snapshot} />
                  <PlanUsage snapshot={snapshot} />
                </>
              ) : figures.length === 0 ? (
                <EmptyReason reason="no_data_yet" title={sectionTitle(section.key, snapshot.period, t)} />
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
                        {/* RN-REP-23 · y debajo la del año pasado, cuando
                            el nivel la trae. Debajo y no al lado: son dos
                            lecturas distintas de la misma cifra. */}
                        <TableCell>
                          <span className="text-sm text-text-secondary">{changeText(figure, t) ?? ""}</span>
                          {yearAgoText(figure, t) === null ? null : (
                            <span className="block text-xs text-text-secondary">
                              {yearAgoText(figure, t)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* RN-REP-21, 22 y 25 · lo que añade Premium+, debajo de la
                  sección de la que cuelga. El equipo revisa aquí antes de
                  enviar: si el PDF llevara bloques que esta pantalla no
                  enseña, estaría aprobando a ciegas. */}
              {section.key === "web_traffic" ? <Traffic snapshot={snapshot} /> : null}
              {section.key === "operation" ? <Timings snapshot={snapshot} /> : null}
              {section.key === "digital" ? (
                <>
                  <Evolution snapshot={snapshot} />
                  <Effects snapshot={snapshot} />
                </>
              ) : null}
            </section>
          );
        })}
    </div>
  );
}

/**
 * RN-REP-33 · el detalle del tráfico de la web: páginas más visitadas,
 * dispositivos y la evolución mes a mes. Lo que no hay no se pinta: sin
 * Analytics, las visitas y los usuarios de arriba ya dicen el motivo.
 */
function Traffic({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  const trafico = snapshot.traffic;
  if (trafico === undefined) return null;
  const tt = t.traffic;
  const numero = (n: number) => new Intl.NumberFormat("es-ES").format(n);

  return (
    <div className="space-y-4">
      {trafico.topPages.length > 0 ? (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold text-primary-dark">{tt.topPagesTitle}</h5>
          <p className="text-xs text-text-secondary">{tt.topPagesHint}</p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{tt.columns.page}</TableHeaderCell>
                <TableHeaderCell>{tt.columns.views}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trafico.topPages.map((linea) => (
                <TableRow key={linea.dimension}>
                  <TableCell>
                    <span className="break-all">{linea.dimension}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-text">{numero(linea.value)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {trafico.devices.length > 0 ? (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold text-primary-dark">{tt.devicesTitle}</h5>
          <p className="text-xs text-text-secondary">{tt.devicesHint}</p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{tt.columns.device}</TableHeaderCell>
                <TableHeaderCell>{tt.columns.visits}</TableHeaderCell>
                <TableHeaderCell>{tt.columns.share}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trafico.devices.map((linea) => {
                const parte = trafficShare(linea.value, trafico.devices);
                return (
                  <TableRow key={linea.dimension}>
                    <TableCell>{deviceName(linea.dimension)}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-text">{numero(linea.value)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-text-secondary">{parte === null ? "" : tt.share(parte)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {trafico.months.length > 0 ? (
        <div className="space-y-2">
          <h5 className="text-sm font-semibold text-primary-dark">{tt.monthsTitle}</h5>
          <p className="text-xs text-text-secondary">{tt.monthsHint}</p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{tt.columns.month}</TableHeaderCell>
                <TableHeaderCell>{tt.columns.visits}</TableHeaderCell>
                <TableHeaderCell>{tt.columns.users}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trafico.months.map((mes) => (
                <TableRow key={mes.month}>
                  <TableCell>
                    {enZona(`${mes.month}-01`, "UTC", { month: "long", year: "numeric" })}
                    {/* Un mes que el periodo no cubre entero se dice: una
                        cifra corta al lado de dos llenas se lee como un
                        desplome y no lo es. */}
                    {mes.partial ? <span className="block text-xs text-danger">{tt.partial}</span> : null}
                  </TableCell>
                  {[mes.sessions, mes.users].map((valor, index) => (
                    <TableCell key={index}>
                      {valor === null ? (
                        <span className="text-sm text-text-secondary">{tt.noData}</span>
                      ) : (
                        <span className="font-semibold text-text">{numero(valor)}</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

/** RN-REP-21 · los tiempos de cada cambio, uno a uno. */
function Timings({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  const filas = snapshot.timings ?? [];
  if (filas.length === 0) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-primary-dark">{t.timings.title}</h5>
      <p className="text-xs text-text-secondary">{t.timings.hint}</p>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t.timings.columns.change}</TableHeaderCell>
            <TableHeaderCell>{t.timings.columns.start}</TableHeaderCell>
            <TableHeaderCell>{t.timings.columns.delivery}</TableHeaderCell>
            <TableHeaderCell>{t.timings.columns.blocked}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filas.map((fila) => (
            <TableRow key={fila.code}>
              <TableCell>
                <span className="font-semibold text-text">{fila.code}</span>
              </TableCell>
              <TableCell>
                {fila.pending !== null ? (
                  <span className="text-sm text-text-secondary">
                    {fila.pending === "in_analysis" ? t.timings.inAnalysis : t.timings.notStarted}
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-text">
                      {fila.startMinutes === null
                        ? t.timings.noValue
                        : t.timings.duration(fila.startMinutes)}
                    </span>
                    {fila.startedWithinSla === null ? null : (
                      <span
                        className={`block text-xs ${
                          fila.startedWithinSla ? "text-primary-dark" : "text-danger"
                        }`}
                      >
                        {fila.startedWithinSla ? t.timings.withinSla : t.timings.outOfSla}
                      </span>
                    )}
                  </>
                )}
              </TableCell>
              <TableCell>
                {fila.deliveryMinutes === null
                  ? t.timings.noValue
                  : t.timings.duration(fila.deliveryMinutes)}
              </TableCell>
              <TableCell>
                {fila.blockedMinutes === 0
                  ? t.timings.noValue
                  : t.timings.duration(fila.blockedMinutes)}
                {fila.blockReasons.length === 0 ? null : (
                  <span className="block text-xs text-text-secondary">
                    {fila.blockReasons.map((motivo) => t.blockReasons[motivo]).join(", ")}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** RN-REP-22 · la evolución dentro del mes, por bloques de 7 días. */
function Evolution({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  const series = snapshot.evolution ?? [];
  const bloques = snapshot.evolutionBuckets ?? [];
  if (series.length === 0 || bloques.length === 0) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-primary-dark">{t.evolution.title}</h5>
      <p className="text-xs text-text-secondary">{t.evolution.hint}</p>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t.columns.name}</TableHeaderCell>
            {bloques.map((bloque) => (
              <TableHeaderCell key={bloque.from}>
                {fechaCorta(bloque.from)}
                {/* El resto del mes se dibuja, pero marcado: una columna
                    corta al lado de cuatro llenas se lee como un desplome
                    y no lo es. */}
                {bloque.partial ? (
                  <span className="block text-xs font-normal text-danger">{t.evolution.partial}</span>
                ) : null}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {series.map((serie) => (
            <TableRow key={`${serie.provider}-${serie.metric}`}>
              <TableCell>
                {t.metrics[serie.metric as keyof typeof t.metrics] ?? serie.metric}
              </TableCell>
              {serie.values.map((valor, index) => (
                <TableCell key={`${bloques[index]?.from ?? index}`}>
                  {valor === null ? (
                    <span className="text-sm text-text-secondary">{t.evolution.noData}</span>
                  ) : (
                    <span className="font-semibold text-text">
                      {Number.isInteger(valor) ? valor : valor.toFixed(1).replace(".", ",")}
                    </span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** RN-REP-25 · qué pasó con las cifras después de cada cambio publicado. */
function Effects({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  const efectos = snapshot.effects ?? [];
  if (efectos.length === 0) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-primary-dark">{t.effect.title}</h5>
      {/* La frase más importante: dice lo que pasó y NO dice que lo
          causara el cambio, porque eso no se sabe. */}
      <p className="text-xs text-text-secondary">{t.effect.hint}</p>
      <ul className="space-y-3">
        {efectos.map((efecto) => (
          <li key={efecto.code} className="rounded-[10px] bg-soft-surface p-3">
            <p className="text-sm font-semibold text-text">
              {efecto.code}
              <span className="ml-2 text-xs font-normal text-text-secondary">
                {t.effect.publishedOn(fechaCorta(efecto.publishedOn))}
              </span>
            </p>
            {efecto.reason !== null ? (
              <p className="mt-1 text-sm text-text-secondary">
                {efecto.reason === "incomplete_window" ? t.effect.incompleteWindow : t.effect.noData}
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {efecto.figures.map((cifra) => (
                  <li key={`${cifra.provider}-${cifra.metric}`} className="text-sm text-text">
                    {t.metrics[cifra.metric as keyof typeof t.metrics] ?? cifra.metric}
                    <span className="ml-2 font-semibold">
                      {t.effect.arrow(String(cifra.before), String(cifra.after))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {efecto.overlapping.length === 0 ? null : (
              <p className="mt-1 text-xs text-danger">
                {t.effect.overlapping(efecto.overlapping.join(", "))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** RN-REP-26 · cuánto está aprovechando el restaurante su plan. */
function PlanUsage({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  const lineas = (snapshot.planUsage ?? []).filter(
    (linea) => linea.included > 0 || linea.used > 0,
  );
  if (lineas.length === 0) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-primary-dark">{t.planUsage.title}</h5>
      <p className="text-xs text-text-secondary">{t.planUsage.hint}</p>
      <Table>
        <TableBody>
          {lineas.map((linea) => (
            <TableRow key={linea.category}>
              <TableCell>{es.naming.categoriesPlural[linea.category]}</TableCell>
              <TableCell>
                <span className="font-semibold text-text">
                  {t.planUsage.line(linea.used, linea.included)}
                </span>
              </TableCell>
              <TableCell>
                <span className={linea.unused > 0 ? "text-sm text-danger" : "text-sm text-text-secondary"}>
                  {t.planUsage.unused(linea.unused, linea.category === "photo")}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** RN-REP-24 · qué pasó con las oportunidades del informe anterior. */
function FollowUp({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  const filas = snapshot.followUp ?? [];
  if (filas.length === 0) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-primary-dark">{t.followUp.title}</h5>
      <Table>
        <TableBody>
          {filas.map((fila) => (
            <TableRow key={fila.id}>
              <TableCell>{opportunityTitle(fila)}</TableCell>
              <TableCell>
                <span
                  className={
                    fila.state === "done"
                      ? "text-sm font-semibold text-primary-dark"
                      : fila.state === "no_longer"
                        ? "text-sm text-text-secondary"
                        : "text-sm font-semibold text-text"
                  }
                >
                  {t.followUp.states[fila.state]}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
