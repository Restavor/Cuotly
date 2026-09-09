import Link from "next/link";

import {
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { AttentionList } from "@/components/home/AttentionList";
import { Icon, type IconName } from "@/components/ui/Icon";
import { UploadFileForm } from "./UploadFileForm";
import { sortedCycleUsage, type CycleUsage } from "@/core/establishments";
import { es } from "@/i18n/es";

import {
  MANAGEMENT_BLOCKS,
  SHEET_TABS,
  filesHref,
  managementBlockLabel,
  sheetHref,
  sheetTabLabel,
  type ManagementBlock,
  type SheetTab,
} from "./tabs";
import type {
  SheetCounts,
  SheetFiles,
  SheetHeader,
  SheetHistoryEntry,
  SheetOperation,
  SheetPayments,
  SheetSummary,
  SheetUsers,
} from "@/app/espacios/[slug]/restaurantes/[id]/sheet-load";

/**
 * La ficha del restaurante para el equipo (PRD §15.2): cinco pestañas, y
 * Gestión con sus cinco bloques.
 *
 * Es de servidor entera. La pestaña viaja en la dirección y no en un
 * estado del navegador, así que "los archivos de Magariños" es un enlace
 * que se comparte, el botón de volver deshace el cambio de pestaña y nada
 * de esto depende de que hidrate JavaScript (CA-22).
 *
 * Lo que la Fase 1 no tiene —datos fiscales, backup de la web,
 * integraciones analíticas, el botón de retirar un acceso— aparece
 * diciendo **por qué** no está, no como un hueco en blanco ni como un dato
 * de ejemplo (CA-20, CLAUDE.md MUST NOT). La maqueta de la que sale esta
 * pantalla enseñaba esos bloques con datos inventados y va marcada como
 * "Datos de ejemplo"; aquí no se copian.
 */
export interface SheetData {
  readonly header: SheetHeader;
  readonly summary: SheetSummary;
  readonly operation: SheetOperation;
  readonly counts: SheetCounts;
  readonly payments: SheetPayments;
  readonly users: SheetUsers;
  readonly files: SheetFiles;
  readonly history: readonly SheetHistoryEntry[];
}

type StatusKey = keyof typeof es.space.statuses;
type RequestStateKey = keyof typeof es.naming.states.request;
type JobStateKey = keyof typeof es.naming.states.job;
type TaskStateKey = keyof typeof es.naming.states.task;
type CategoryKey = keyof typeof es.naming.categories;
type FileCategoryKey = keyof typeof es.establishmentSheet.fileCategories;
type FileVariantKey = keyof typeof es.establishmentSheet.fileVariants;
type ClientRoleKey = keyof typeof es.establishmentSheet.clientRoles;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;

const t = es.establishmentSheet;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function dia(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}

function diaCorto(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(new Date(value));
}

/**
 * El tamaño en megabytes, con la coma decimal del español. `toFixed()`
 * escribe siempre un punto, así que "2.4 MB" se colaba en una pantalla que
 * en la línea de al lado escribe "599,00 €".
 */
function megabytes(sizeBytes: number): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(sizeBytes / 1_048_576);
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
}

/**
 * Una de las tres tarjetas de cabecera del Resumen: plan, Menú Diario y
 * renovación (maqueta §15.2).
 *
 * El recuadro del icono es decoración —va con `aria-hidden`— y el dato lo
 * lleva siempre el texto: quien no ve el icono no pierde nada (§21.4). El
 * pie es opcional porque no todas las tarjetas tienen segunda línea, y
 * cuando no la hay se queda sin ella en vez de rellenarla con un guion.
 */
function FactCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-[20px] border border-border bg-surface p-5">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-cuotly-green/10 text-cuotly-green"
      >
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-text-secondary">{label}</span>
        <span className="block truncate text-lg font-semibold text-primary-dark">{value}</span>
        {hint === undefined ? null : (
          <span className="block text-sm text-text-secondary">{hint}</span>
        )}
      </span>
    </div>
  );
}

/**
 * Una bolsa del ciclo. El porcentaje puede ser `null` —el plan no incluye
 * nada de esa categoría— y entonces no se pinta barra: una barra al 0 %
 * diría "te quedan todos", que es lo contrario de lo que pasa.
 */
function CycleBagCard({ bag }: { bag: CycleUsage }) {
  const devueltos = bag.used < 0 ? -bag.used : 0;

  return (
    <div className="rounded-lg bg-soft-surface p-3">
      <p className="text-xs text-text-secondary">
        {es.naming.categories[bag.category as CategoryKey] ?? bag.category}
      </p>
      <p className="text-sm font-semibold text-primary-dark">
        {t.cycleUsed(Math.max(0, bag.used), bag.included)}
      </p>

      {bag.percentUsed === null ? (
        <p className="mt-1 text-xs text-text-secondary">{t.cycleNotIncluded}</p>
      ) : (
        <>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuenow={bag.percentUsed}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={es.naming.categories[bag.category as CategoryKey] ?? bag.category}
          >
            <div className="h-full bg-cuotly-green" style={{ width: `${bag.percentUsed}%` }} />
          </div>
          {/*
            El porcentaje va escrito además de dibujado. La barra sola
            obliga a estimar a ojo cuánto queda, y a quien no la ve no le
            dice nada: el número es el dato y la barra, su forma.
          */}
          <p className="mt-1 flex items-baseline justify-between gap-2 text-xs text-text-secondary">
            <span>
              {bag.exhausted ? t.cycleExhausted : t.cycleRemaining(bag.remaining)}
              {devueltos > 0 ? ` · ${t.cycleReturned(devueltos)}` : ""}
            </span>
            <span className="shrink-0 font-semibold text-text">
              {t.cyclePercent(bag.percentUsed)}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * El desplegable "Categoría" del catálogo. Es un `<form method="get">`,
 * sin una línea de JavaScript, igual que los filtros del listado (§20.2):
 * filtra al enviar, no mientras se elige, y funciona antes de que hidrate
 * nada.
 *
 * Solo se pinta cuando hay más de una categoría que elegir. Un filtro con
 * una única opción no filtra nada y solo estorba.
 */
function CategoryFilter({
  base,
  categories,
  current,
  selectedFileId,
}: {
  base: string;
  categories: readonly string[];
  current: string | null;
  selectedFileId: string | null;
}) {
  return (
    <form method="get" action={base} className="flex shrink-0 items-center gap-2">
      {/*
        La pestaña y el bloque viajan como campos ocultos: sin ellos,
        filtrar devolvería a Resumen, que no es donde estaba quien filtra.
      */}
      <input type="hidden" name="vista" value={SHEET_TABS[3].slug} />
      <input type="hidden" name="bloque" value={MANAGEMENT_BLOCKS[3].slug} />
      {selectedFileId === null ? null : (
        <input type="hidden" name="archivo" value={selectedFileId} />
      )}

      <label htmlFor="filtro-tipo-archivo" className="text-sm text-text-secondary">
        {t.filterLabel}
      </label>
      <select
        id="filtro-tipo-archivo"
        name="tipo"
        defaultValue={current ?? ""}
        className="rounded-field border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        <option value="">{t.filterAll}</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {t.fileCategories[category as FileCategoryKey] ?? category}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-field border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {t.filterSubmit}
      </button>
    </form>
  );
}

/**
 * RN-ARC-04 · si un archivo lo ve el restaurante o solo el equipo.
 *
 * El punto acompaña al texto, nunca lo sustituye: el color no puede ser la
 * única señal de algo que decide quién ve qué (§21.4). Quien mira en
 * blanco y negro lee "Interno" igual.
 */
function VisibilityMark({ visibility }: { visibility: string }) {
  const compartido = visibility === "shared_with_client";
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${compartido ? "bg-success" : "bg-text-secondary"}`}
      />
      {compartido ? es.space.files.sharedWithClient : es.space.files.internal}
    </span>
  );
}

function TabNav({ base, active }: { base: string; active: SheetTab }) {
  return (
    <nav aria-label={t.tabsLabel} className="border-b border-border">
      <ul className="flex flex-wrap gap-1">
        {SHEET_TABS.map((tab) => {
          const seleccionada = tab.key === active.key;
          return (
            <li key={tab.key}>
              <Link
                href={sheetHref(base, tab)}
                aria-current={seleccionada ? "page" : undefined}
                className={`-mb-px inline-block border-b-2 px-3 py-2 text-sm ${
                  seleccionada
                    ? "border-cuotly-green font-semibold text-primary-dark"
                    : "border-transparent text-text-secondary hover:text-text"
                }`}
              >
                {sheetTabLabel(tab)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Los cinco bloques de Gestión, como control segmentado: una pista clara
 * con el bloque elegido en blanco encima (maqueta §15.2).
 *
 * Siguen siendo enlaces, no botones: el bloque vive en la dirección
 * (`?vista=gestion&bloque=archivos`) y esta barra solo lo enseña. Que
 * parezca un interruptor no lo convierte en uno — sin JavaScript navega
 * igual (CA-22).
 */
function BlockNav({ base, active }: { base: string; active: ManagementBlock }) {
  return (
    <nav aria-label={t.blocksLabel}>
      <ul className="inline-flex flex-wrap gap-1 rounded-[14px] bg-soft-surface p-1">
        {MANAGEMENT_BLOCKS.map((block) => {
          const seleccionado = block.key === active.key;
          return (
            <li key={block.key}>
              <Link
                href={sheetHref(base, SHEET_TABS[3], block)}
                aria-current={seleccionado ? "true" : undefined}
                className={`inline-block rounded-[10px] px-3.5 py-1.5 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
                  seleccionado
                    ? "bg-surface font-semibold text-primary-dark shadow-sm"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                {managementBlockLabel(block)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function EstablishmentSheet({
  base,
  slug,
  tab,
  block,
  data,
}: {
  base: string;
  slug: string;
  tab: SheetTab;
  block: ManagementBlock;
  data: SheetData;
}) {
  const { header, summary, operation, counts, payments, users, files, history } = data;
  const bolsas = sortedCycleUsage(summary.bags);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="space-y-2">
        <p className="text-sm text-text-secondary">{header.groupName ?? "—"}</p>
        <h1 className="text-2xl font-bold text-primary-dark">
          {header.name} <span className="text-text-secondary">{header.code}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(header.status)}>
            {es.space.statuses[header.status as StatusKey] ?? header.status}
          </StatusBadge>
          {header.planName ? <StatusBadge tone="info">{header.planName}</StatusBadge> : null}
        </div>
      </header>

      <TabNav base={base} active={tab} />

      {tab.key === "summary" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <FactCard
              icon="crown"
              label={t.planTitle}
              value={header.planName ?? t.planNone}
              hint={
                header.planName === null
                  ? t.planNoneReason
                  : header.planPriceCents === null
                    ? undefined
                    : t.planPrice(euros(header.planPriceCents))
              }
            />

            <FactCard
              icon="document"
              label={t.serviceTitle}
              value={header.services.length > 0 ? t.serviceContracted : t.serviceNotContracted}
            />

            <FactCard
              icon="calendar"
              label={t.renewalTitle}
              value={header.cycleEnd === null ? t.renewalNone : dia(header.cycleEnd)}
            />
          </div>

          {/*
            Las dos cuentas del ciclo van una al lado de la otra, como en
            la maqueta: los cambios del plan a la izquierda y las
            actualizaciones de Menú Diario a la derecha. Son contadores
            distintos (RN-CON-02) y verlos juntos es justo lo que evita
            confundirlos.
          */}
          <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
            <Card
              title={t.cycleTitle}
              action={
                header.cycleStart !== null && header.cycleEnd !== null ? (
                  <span className="shrink-0 text-sm text-text-secondary">
                    {t.cycleRange(dia(header.cycleStart), dia(header.cycleEnd))}
                  </span>
                ) : undefined
              }
            >
              {bolsas.length === 0 ? (
                <EmptyState title={t.cycleEmptyTitle} description={t.cycleEmptyReason} />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {bolsas.map((bag) => (
                      <CycleBagCard key={bag.category} bag={bag} />
                    ))}
                  </div>
                  <p className="mt-3 text-sm">
                    <Link href={`${base}/consumos`} className="text-cuotly-green underline">
                      {t.ledgerLink}
                    </Link>
                  </p>
                </>
              )}
            </Card>

            {/*
              RN-CON-02: Menú Diario cuenta sus actualizaciones aparte de
              los cambios, y ese contador todavía no existe. La maqueta
              enseña aquí "12 de 30 actualizaciones usadas" con su barra al
              40 %, y va marcada como datos de ejemplo: ese número no lo
              está contando nadie, así que aquí se dice el motivo en vez de
              copiarlo (CLAUDE.md MUST NOT).
            */}
            <Card title={t.dailyMenuCounterTitle}>
              <EmptyState
                title={t.dailyMenuCounterEmptyTitle}
                description={t.dailyMenuCounterEmptyReason}
              />
            </Card>
          </div>

          <Card title={t.attentionTitle}>
            {summary.attention.length === 0 ? (
              <EmptyState title={t.attentionEmptyTitle} description={t.attentionEmptyReason} />
            ) : (
              <AttentionList items={summary.attention} />
            )}
          </Card>
        </>
      ) : null}

      {tab.key === "operation" ? (
        <>
          {/*
            §15.2 pide razón social, identificación fiscal, dirección,
            teléfonos y contactos. `establishments` no tiene ninguna de esas
            columnas, así que no hay nada que enseñar y se dice cuál es el
            motivo en vez de dejar el bloque en blanco.
          */}
          <Card title={t.identityTitle}>
            <EmptyState title={t.identityMissing} description={t.identityMissingReason} />
          </Card>

          <Card title={t.requestsTitle}>
            {operation.requests.length === 0 ? (
              <EmptyState title={t.requestsEmptyTitle} description={t.requestsEmptyReason} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.descriptionColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.dateColumn}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {operation.requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <Link
                          href={`/espacios/${slug}/solicitudes/${request.id}`}
                          className="text-cuotly-green underline"
                        >
                          {request.code}
                        </Link>
                      </TableCell>
                      <TableCell>{request.description}</TableCell>
                      <TableCell>
                        {es.naming.states.request[request.state as RequestStateKey] ?? request.state}
                      </TableCell>
                      <TableCell>{diaCorto(request.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card title={t.jobsTitle}>
            {operation.jobs.length === 0 ? (
              <EmptyState title={t.jobsEmptyTitle} description={t.jobsEmptyReason} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.dateColumn}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {operation.jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Link
                          href={`/espacios/${slug}/trabajos/${job.id}`}
                          className="text-cuotly-green underline"
                        >
                          {job.code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {es.naming.states.job[job.state as JobStateKey] ?? job.state}
                      </TableCell>
                      <TableCell>{diaCorto(job.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      ) : null}

      {tab.key === "data" ? (
        <>
          <Card title={t.countsTitle}>
            <p className="mb-3 text-sm text-text-secondary">{t.countsHint}</p>
            {counts.requestsByState.length === 0 && counts.jobsByState.length === 0 ? (
              <EmptyState title={t.countsEmptyTitle} description={t.countsEmptyReason} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">{t.countsRequests}</p>
                  <p className="text-lg font-semibold text-primary-dark">
                    {counts.requestsByState.reduce((total, [, n]) => total + n, 0)}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary">{t.countsByState}</p>
                  <ul className="text-sm text-text">
                    {counts.requestsByState.map(([state, n]) => (
                      <li key={state}>
                        {(es.naming.states.request[state as RequestStateKey] ?? state) + ": " + n}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">{t.countsJobs}</p>
                  <p className="text-lg font-semibold text-primary-dark">
                    {counts.jobsByState.reduce((total, [, n]) => total + n, 0)}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary">{t.countsByState}</p>
                  <ul className="text-sm text-text">
                    {counts.jobsByState.map(([state, n]) => (
                      <li key={state}>
                        {(es.naming.states.job[state as JobStateKey] ?? state) + ": " + n}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">{t.countsFiles}</p>
                  <p className="text-lg font-semibold text-primary-dark">{counts.files}</p>
                </div>
              </div>
            )}
          </Card>

          <Card title={t.digitalTitle}>
            <EmptyState title={t.digitalEmptyTitle} description={t.digitalEmptyReason} />
          </Card>
        </>
      ) : null}

      {tab.key === "management" ? (
        <>
          <BlockNav base={base} active={block} />

          {block.key === "plan" ? (
            <Card title={t.subscriptionTitle}>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-text-secondary">{t.planTitle}</dt>
                  <dd className="font-semibold text-primary-dark">
                    {header.planName ?? t.planNone}
                    {header.planPriceCents === null
                      ? ""
                      : ` · ${t.planPrice(euros(header.planPriceCents))}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{t.servicesTitle}</dt>
                  <dd className="font-semibold text-primary-dark">
                    {header.services.length === 0 ? t.servicesNone : header.services.join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{t.commitmentTitle}</dt>
                  <dd className="font-semibold text-primary-dark">
                    {header.commitmentEndsAt === null
                      ? t.commitmentNone
                      : new Date(header.commitmentEndsAt) > new Date()
                        ? t.commitmentUntil(dia(header.commitmentEndsAt))
                        : t.commitmentOver}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm">
                <Link href={`/espacios/${slug}/planes`} className="text-cuotly-green underline">
                  {t.manageplanLink}
                </Link>
              </p>
            </Card>
          ) : null}

          {block.key === "payments" ? (
            <Card title={t.chargesTitle}>
              {/*
                RN-FIN-07 · quién ve la facturación lo decide el servidor.
                `allowed` es lo que contestó, y a quien no le corresponde se
                le dice el motivo en vez de enseñarle una tabla vacía que
                parecería "no hay cobros".
              */}
              {!payments.allowed ? (
                <EmptyState
                  title={t.chargesNoAccessTitle}
                  description={t.chargesNoAccessReason}
                />
              ) : payments.charges.length === 0 ? (
                <EmptyState title={t.chargesEmptyTitle} description={t.chargesEmptyReason} />
              ) : (
                <>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t.conceptColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.amountColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.dueColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.outstandingColumn}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {payments.charges.map((charge) => (
                        <TableRow key={charge.id}>
                          <TableCell>{charge.concept}</TableCell>
                          <TableCell>{euros(charge.totalCents)}</TableCell>
                          <TableCell>{diaCorto(charge.dueAt)}</TableCell>
                          <TableCell>
                            {es.teamArea.chargeStates[charge.status as ChargeStateKey] ??
                              charge.status}
                          </TableCell>
                          <TableCell>{euros(charge.outstandingCents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-sm">
                    <Link
                      href={`/espacios/${slug}/finanzas`}
                      className="text-cuotly-green underline"
                    >
                      {t.financeLink}
                    </Link>
                  </p>
                </>
              )}
            </Card>
          ) : null}

          {block.key === "users" ? (
            <Card title={t.usersTitle}>
              {/*
                Una consulta fallida y una lista vacía NO son lo mismo, y se
                distinguen: "no hay nadie" frente a "no se ha podido
                comprobar" (CA-20).
              */}
              {users.failed ? (
                <EmptyState title={t.usersFailedTitle} description={t.usersFailedReason} />
              ) : users.rows.length === 0 ? (
                <EmptyState title={t.usersEmptyTitle} description={t.usersEmptyReason} />
              ) : (
                <>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t.personColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.accessColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.roleColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.permissionsColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.sinceColumn}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.rows.map((user) => {
                        const permisos: string[] = [];
                        if (user.canEditData) permisos.push(t.permissionEditData);
                        if (user.canViewBilling) permisos.push(t.permissionViewBilling);

                        return (
                          <TableRow key={`${user.source}:${user.userId}`}>
                            <TableCell>
                              <span className="block text-text">
                                {user.displayName ?? t.noName}
                              </span>
                              <span className="block text-xs text-text-secondary">
                                {user.email}
                              </span>
                            </TableCell>
                            <TableCell>
                              {user.source === "group" ? t.sourceGroup : t.sourceEstablishment}
                            </TableCell>
                            <TableCell>
                              {t.clientRoles[user.role as ClientRoleKey] ?? user.role}
                            </TableCell>
                            <TableCell>
                              {permisos.length === 0 ? t.permissionsNone : permisos.join(" · ")}
                            </TableCell>
                            <TableCell>{diaCorto(user.grantedAt)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-sm text-text-secondary">{t.revokeHint}</p>
                </>
              )}
            </Card>
          ) : null}

          {block.key === "files" ? (
            <>
              <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
                <Card
                  title={t.filesTitle(header.name)}
                  action={
                    files.categories.length > 1 ? (
                      <CategoryFilter
                        base={base}
                        categories={files.categories}
                        current={files.category}
                        selectedFileId={files.selected?.file.id ?? null}
                      />
                    ) : undefined
                  }
                >
                  <UploadFileForm establishmentId={header.id} />

                  <div className="mt-4">
                    {files.files.length === 0 ? (
                      <EmptyState title={t.filesEmptyTitle} description={t.filesEmptyReason} />
                    ) : (
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableHeaderCell>{t.fileNameColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileCategoryColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileVisibilityColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileVersionColumn}</TableHeaderCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {files.files.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell>
                                {/*
                                  El enlace elige el archivo del panel de
                                  versiones. Va en la dirección: compartirlo
                                  abre exactamente esto.
                                */}
                                <Link
                                  href={filesHref(base, {
                                    category: files.category,
                                    fileId: file.id,
                                  })}
                                  className="text-cuotly-green underline"
                                >
                                  {file.name}
                                </Link>
                                {file.archivedAt === null ? null : (
                                  <span className="ml-2 text-xs text-text-secondary">
                                    {t.fileArchived}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {t.fileCategories[file.category as FileCategoryKey] ?? file.category}
                              </TableCell>
                              <TableCell>
                                <VisibilityMark visibility={file.visibility} />
                              </TableCell>
                              <TableCell>{t.fileVersion(file.lastVersion)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </Card>

                <Card>
                  {files.selected === null ? (
                    <>
                      <h3 className="mb-3 text-base font-semibold text-primary-dark">
                        {t.versionsTitle}
                      </h3>
                      <p className="text-sm text-text-secondary">{t.versionsPick}</p>
                    </>
                  ) : (
                    <>
                      {/*
                        La cabecera del panel: qué archivo se está mirando y
                        la salida. La X es un enlace a este mismo bloque sin
                        `?archivo=`, así que cerrar el panel también se
                        deshace con el botón de volver.
                      */}
                      <div className="mb-4 flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-text-secondary"
                        >
                          <Icon name="image" className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-primary-dark">
                            {files.selected.file.name}
                          </p>
                          <p className="mt-1">
                            <StatusBadge tone="neutral">
                              {t.fileCategories[
                                files.selected.file.category as FileCategoryKey
                              ] ?? files.selected.file.category}
                            </StatusBadge>
                          </p>
                        </div>
                        <Link
                          href={filesHref(base, { category: files.category, fileId: null })}
                          aria-label={t.versionsClose}
                          className="shrink-0 rounded p-1 text-text-secondary transition-colors hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
                        >
                          <Icon name="close" className="h-4 w-4" />
                        </Link>
                      </div>

                      <h3 className="mb-2 text-base font-semibold text-primary-dark">
                        {t.versionsTitle}
                      </h3>
                      <ul className="space-y-2">
                        {files.selected.versions.map((version) => (
                          <li
                            key={version.id}
                            className="flex items-start gap-3 rounded-[10px] bg-soft-surface p-2 text-sm"
                          >
                            {/*
                              La miniatura es el propio archivo servido por
                              la ruta privada, no una copia optimizada:
                              RN-ARC-08 pide esa optimización y la Fase 1 no
                              la monta, así que se dice en el adaptador y no
                              se finge aquí. Lo que no es imagen no enseña
                              recuadro vacío: dice que no hay vista previa.
                            */}
                            {version.mimeType.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element -- el original vive en un bucket privado y llega por un 302 firmado y temporal (RN-ARC-08): `next/image` no puede optimizar una URL que caduca en cinco minutos.
                              <img
                                src={`/api/archivos/${files.selected!.file.id}?version=${version.versionNumber}`}
                                /*
                                  Alternativa vacía a propósito: la miniatura
                                  no añade nada que no esté escrito al lado
                                  —el nombre del archivo está en la cabecera
                                  del panel y la versión, en la fila—, y una
                                  alternativa que repite eso solo lo hace
                                  leer dos veces. Además, así una miniatura
                                  que no cargue deja un hueco y no un párrafo
                                  desbordado.
                                */
                                alt=""
                                className="h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-border bg-soft-surface object-cover"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface text-text-secondary"
                              >
                                <Icon name="document" className="h-5 w-5" />
                              </span>
                            )}

                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-primary-dark">
                                {version.variant === null
                                  ? t.fileVersion(version.versionNumber)
                                  : (t.fileVariants[version.variant as FileVariantKey] ??
                                    version.variant)}
                              </span>
                              <span className="block text-xs text-text-secondary">
                                {dia(version.createdAt)} · {t.fileSize(megabytes(version.sizeBytes))}
                              </span>
                              {/* RN-ARC-08: enlace privado y temporal, firmado tras
                                  comprobar el permiso. Cada versión descarga LA SUYA. */}
                              <a
                                href={`/api/archivos/${files.selected!.file.id}?version=${version.versionNumber}`}
                                className="text-cuotly-green underline"
                              >
                                {es.files.download}
                              </a>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Card>
              </div>

              {/*
                El backup va a lo ancho y debajo, como en la maqueta. Lo que
                la maqueta enseña dentro —"Último respaldo: 7 sep 2026"— es
                un dato de ejemplo: Cuotly no copia la web de nadie todavía,
                así que aquí va el motivo (CLAUDE.md MUST NOT).
              */}
              <Card>
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-soft-surface text-text-secondary"
                  >
                    <Icon name="database" className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-primary-dark">{t.backupTitle}</h3>
                    <p className="mt-1 text-sm font-medium text-text">{t.backupEmptyTitle}</p>
                    <p className="mt-1 text-sm text-text-secondary">{t.backupEmptyReason}</p>
                  </div>
                </div>
              </Card>
            </>
          ) : null}


          {block.key === "integrations" ? (
            <Card title={t.integrationsTitle}>
              <EmptyState
                title={t.integrationsEmptyTitle}
                description={t.integrationsEmptyReason}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {tab.key === "history" ? (
        <Card title={t.historyTitle}>
          <p className="mb-3 text-sm text-text-secondary">{t.historyHint}</p>
          {history.length === 0 ? (
            <EmptyState title={t.historyEmptyTitle} description={t.historyEmptyReason} />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {history.map((entry) => (
                  <li key={entry.id} className="py-2 text-sm">
                    <span className="text-text-secondary">{diaCorto(entry.occurredAt)} · </span>
                    {entry.deepLink === null ? (
                      <span className="text-text">{entry.jobCode ?? entry.entityType}</span>
                    ) : (
                      <Link href={entry.deepLink} className="text-cuotly-green underline">
                        {entry.jobCode ?? entry.entityType}
                      </Link>
                    )}
                    <span className="text-text">
                      {" · "}
                      {entry.entityType === "job"
                        ? (es.naming.states.job[entry.toState as JobStateKey] ?? entry.toState)
                        : (es.naming.states.task[entry.toState as TaskStateKey] ??
                          entry.toState)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <Link href={`/espacios/${slug}/ajustes`} className="text-cuotly-green underline">
                  {t.auditLink}
                </Link>
              </p>
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
