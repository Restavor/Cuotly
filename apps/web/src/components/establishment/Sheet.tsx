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
import { sortedCycleUsage, type CycleUsage } from "@/core/establishments";
import { es } from "@/i18n/es";

import {
  MANAGEMENT_BLOCKS,
  SHEET_TABS,
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

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
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
          <p className="mt-1 text-xs text-text-secondary">
            {bag.exhausted ? t.cycleExhausted : t.cycleRemaining(bag.remaining)}
            {devueltos > 0 ? ` · ${t.cycleReturned(devueltos)}` : ""}
          </p>
        </>
      )}
    </div>
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

function BlockNav({ base, active }: { base: string; active: ManagementBlock }) {
  return (
    <nav aria-label={t.blocksLabel}>
      <ul className="flex flex-wrap gap-2">
        {MANAGEMENT_BLOCKS.map((block) => {
          const seleccionado = block.key === active.key;
          return (
            <li key={block.key}>
              <Link
                href={sheetHref(base, SHEET_TABS[3], block)}
                aria-current={seleccionado ? "true" : undefined}
                className={`inline-block rounded-[10px] px-3 py-1.5 text-sm ${
                  seleccionado
                    ? "bg-primary-dark font-semibold text-white"
                    : "bg-soft-surface text-text-secondary hover:text-text"
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
            <Card title={t.planTitle}>
              {header.planName === null ? (
                <>
                  <p className="font-semibold text-primary-dark">{t.planNone}</p>
                  <p className="mt-1 text-sm text-text-secondary">{t.planNoneReason}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-primary-dark">{header.planName}</p>
                  {header.planPriceCents === null ? null : (
                    <p className="mt-1 text-sm text-text-secondary">
                      {t.planPrice(euros(header.planPriceCents))}
                    </p>
                  )}
                </>
              )}
            </Card>

            <Card title={t.serviceTitle}>
              <p className="font-semibold text-primary-dark">
                {header.services.length > 0 ? t.serviceContracted : t.serviceNotContracted}
              </p>
            </Card>

            <Card title={t.renewalTitle}>
              <p className="font-semibold text-primary-dark">
                {header.cycleEnd === null ? t.renewalNone : dia(header.cycleEnd)}
              </p>
            </Card>
          </div>

          <Card title={t.cycleTitle}>
            {bolsas.length === 0 ? (
              <EmptyState title={t.cycleEmptyTitle} description={t.cycleEmptyReason} />
            ) : (
              <>
                {header.cycleStart !== null && header.cycleEnd !== null ? (
                  <p className="mb-3 text-sm text-text-secondary">
                    {t.cycleRange(dia(header.cycleStart), dia(header.cycleEnd))}
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            RN-CON-02: Menú Diario cuenta sus actualizaciones aparte de los
            cambios, y ese contador todavía no existe. Se dice; no se pinta
            un "12 de 30" que nadie está contando.
          */}
          <Card title={t.dailyMenuCounterTitle}>
            <EmptyState
              title={t.dailyMenuCounterEmptyTitle}
              description={t.dailyMenuCounterEmptyReason}
            />
          </Card>

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
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Card title={t.filesTitle(header.name)}>
                {files.files.length === 0 ? (
                  <EmptyState title={t.filesEmptyTitle} description={t.filesEmptyReason} />
                ) : (
                  <>
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
                                href={`${sheetHref(base, SHEET_TABS[3], MANAGEMENT_BLOCKS[3])}&archivo=${file.id}`}
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
                              {file.visibility === "shared_with_client"
                                ? es.space.files.sharedWithClient
                                : es.space.files.internal}
                            </TableCell>
                            <TableCell>{t.fileVersion(file.lastVersion)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="mt-3 text-sm text-text-secondary">{t.filesUploadHint}</p>
                  </>
                )}
              </Card>

              <Card title={t.versionsTitle}>
                {files.selected === null ? (
                  <p className="text-sm text-text-secondary">{t.versionsPick}</p>
                ) : (
                  <>
                    <p className="mb-3 text-sm font-semibold text-text">
                      {t.versionsOf(files.selected.file.name)}
                    </p>
                    <ul className="space-y-2">
                      {files.selected.versions.map((version) => (
                        <li key={version.id} className="rounded-lg bg-soft-surface p-2 text-sm">
                          <p className="font-semibold text-primary-dark">
                            {version.variant === null
                              ? t.fileVersion(version.versionNumber)
                              : (t.fileVariants[version.variant as FileVariantKey] ??
                                version.variant)}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {diaCorto(version.createdAt)} ·{" "}
                            {t.fileSize((version.sizeBytes / 1_048_576).toFixed(1))}
                          </p>
                          {/* RN-ARC-08: enlace privado y temporal, firmado tras
                              comprobar el permiso. */}
                          <a
                            href={`/api/archivos/${files.selected!.file.id}`}
                            className="text-cuotly-green underline"
                          >
                            {es.files.download}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm">
                      <Link
                        href={sheetHref(base, SHEET_TABS[3], MANAGEMENT_BLOCKS[3])}
                        className="text-cuotly-green underline"
                      >
                        {t.versionsClose}
                      </Link>
                    </p>
                  </>
                )}
              </Card>

              <Card title={t.backupTitle}>
                <EmptyState title={t.backupEmptyTitle} description={t.backupEmptyReason} />
              </Card>
            </div>
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
