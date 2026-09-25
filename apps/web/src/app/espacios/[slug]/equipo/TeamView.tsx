import Link from "next/link";
import type { ReactNode } from "react";

import { InviteMemberForm } from "@/components/InviteMemberForm";
import {
  Avatar,
  ButtonLink,
  Card,
  EmptyState,
  NoPermissionState,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
} from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon } from "@/components/ui/Icon";
import {
  authorizedEstablishments,
  canPerformJobs,
  dayStatus,
  invitationExpired,
  memberRemoval,
  shiftWeek,
  teamCounts,
  upcomingAbsences,
  weekDays,
  type DayStatus,
  type TeamTab,
} from "@/core/team-roster";
import { enZona, fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

import {
  CancelInvitationButton,
  CopyInviteLinkButton,
  PermissionsForm,
  RemoveMemberCard,
} from "./TeamForms";
import type {
  AbsenceRow,
  HistoryEntry,
  PendingInvitation,
  PendingReassignment,
  TeamData,
  TeamMember,
} from "./team-load";

const t = es.teamPage;

type RoleKey = keyof typeof t.roles;
type StatusKey = keyof typeof es.space.statuses;
type SpecialtyKey = keyof typeof es.naming.specialties;
type AuditKey = keyof typeof es.settings.auditActions;

export function roleLabel(role: string): string {
  return role in t.roles ? t.roles[role as RoleKey] : role;
}

function statusLabel(status: string): string {
  return status in es.space.statuses
    ? es.space.statuses[status as StatusKey]
    : status;
}

function specialtyLabel(key: string): string {
  return key in es.naming.specialties
    ? es.naming.specialties[key as SpecialtyKey]
    : key;
}

type StatusTone = Parameters<typeof StatusBadge>[0]["tone"];

function roleTone(role: string): StatusTone {
  return role === "owner" ? "info" : role === "admin" ? "success" : "neutral";
}

/**
 * Las pestañas de Equipo (M69 a M72), iguales en las cuatro pantallas.
 * Son la misma ruta con `?tab=`: el enlace de siempre, `/equipo`, sigue
 * llevando a "Miembros y carga".
 */
export function TeamTabs({ slug, active }: { slug: string; active: TeamTab }) {
  const base = `/espacios/${slug}/equipo`;
  return (
    <Tabs
      label={t.tabsLabel}
      active={active}
      tabs={(
        ["miembros", "permisos", "invitaciones", "supervision"] as const
      ).map((key) => ({
        key,
        label: t.tabs[key],
        href: key === "miembros" ? base : `${base}?tab=${key}`,
      }))}
    />
  );
}

function nameMap(members: readonly TeamMember[]): ReadonlyMap<string, string> {
  return new Map(members.map((m) => [m.userId, m.name]));
}

/** El principal vigente de cada trabajador y, si lo hay, el sustituto. */
function supervisorOf(
  data: TeamData,
  userId: string,
  names: ReadonlyMap<string, string>,
) {
  const principal = data.supervisions.find(
    (s) => s.workerId === userId && s.kind === "principal",
  );
  const substitute = data.supervisions.find(
    (s) => s.workerId === userId && s.kind === "substitute",
  );
  return {
    principal: principal ? (names.get(principal.adminId) ?? "—") : null,
    substitute: substitute ? (names.get(substitute.adminId) ?? "—") : null,
  };
}

function MemberCell({ member }: { member: TeamMember }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={member.name} size={36} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text">
          {member.name}
        </span>
        <span className="block truncate text-xs text-text-secondary">
          {member.email ?? roleLabel(member.role)}
        </span>
      </span>
    </span>
  );
}

function AvailabilityDot({ available }: { available: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-text-secondary">
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${available ? "bg-success" : "bg-border"}`}
      />
      {available ? t.members.available : t.members.unavailable}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/* M69 · Miembros y carga                                                   */
/* ----------------------------------------------------------------------- */

export function MembersTab({ slug, data }: { slug: string; data: TeamData }) {
  const tm = t.members;
  const counts = teamCounts(data.members);
  const names = nameMap(data.members);
  const establishmentName = new Map(
    data.establishments.map((e) => [e.id, e.name]),
  );
  const totalLoad = data.members
    .filter((m) => m.status === "active")
    .reduce((sum, m) => sum + (m.loadPoints ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        <StatCard icon="team" label={tm.statMembers} value={counts.members} />
        <StatCard
          icon="person"
          tone="info"
          label={tm.statAdmins}
          value={counts.admins}
        />
        <StatCard
          icon="team"
          tone="neutral"
          label={tm.statWorkers}
          value={counts.workers}
        />
        <StatCard
          icon="clock"
          label={tm.statLoad}
          value={
            data.loadState === "ok"
              ? tm.points(totalLoad)
              : data.loadState === "failed"
                ? tm.loadFailed
                : tm.loadNoPermission
          }
          hint={
            data.loadState === "no_permission"
              ? tm.loadNoPermissionHint
              : tm.statLoadHint
          }
          testId="equipo-carga-total"
        />
      </div>

      <Card className="p-0! overflow-hidden">
        {data.members.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={es.space.team.title}
              description={es.space.team.empty}
            />
          </div>
        ) : (
          // El testid es de los recorridos: dice "esta persona está en el
          // equipo" mirando la columna de nombres de esta tabla.
          <div
            className="relative overflow-x-auto"
            data-testid="equipo-miembros"
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{tm.memberColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.roleColumn}</TableHeaderCell>
                  <TableHeaderCell>{tm.specialtiesColumn}</TableHeaderCell>
                  <TableHeaderCell>{tm.establishmentsColumn}</TableHeaderCell>
                  <TableHeaderCell>{tm.loadColumn}</TableHeaderCell>
                  <TableHeaderCell>{tm.availabilityColumn}</TableHeaderCell>
                  <TableHeaderCell>{tm.supervisorColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.statusColumn}</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">{tm.actionsColumn}</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.members.map((m) => {
                  const autorizados = authorizedEstablishments(
                    m.role,
                    m.establishmentIds,
                  );
                  const supervisor = supervisorOf(data, m.userId, names);
                  const realiza = canPerformJobs(m.role, m.adminCanPerformJobs);
                  return (
                    <TableRow key={m.userId}>
                      <TableCell>
                        <MemberCell member={m} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={roleTone(m.role)}>
                          {roleLabel(m.role)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-text-secondary">
                          {m.specialties.length === 0 ? (
                            realiza ? (
                              tm.noneFeminine
                            ) : (
                              "—"
                            )
                          ) : (
                            <ul>
                              {m.specialties.map((s) => (
                                <li key={s}>{specialtyLabel(s)}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-56 text-sm text-text-secondary">
                          {autorizados.all
                            ? tm.allEstablishments(data.establishments.length)
                            : autorizados.ids.length === 0
                              ? tm.none
                              : autorizados.ids
                                  .map((id) => establishmentName.get(id) ?? "—")
                                  .join(", ")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="whitespace-nowrap text-sm text-text-secondary">
                          {!realiza || m.loadPoints === null
                            ? "—"
                            : tm.points(m.loadPoints)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <AvailabilityDot available={m.available} />
                      </TableCell>
                      {/*
                        La supervisión es de los trabajadores. A un
                        administrador no se le pinta "Sin asignar": puede
                        existir sin supervisados (RN-SUP-06).
                      */}
                      <TableCell>
                        <div className="text-sm text-text-secondary">
                          {m.role !== "worker" ? (
                            "—"
                          ) : (
                            <>
                              <span className="block">
                                {supervisor.principal ?? t.noPrincipal}
                              </span>
                              {supervisor.substitute ? (
                                <span className="block text-xs">
                                  {t.substituteColumn}: {supervisor.substitute}
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={m.status === "active" ? "success" : "neutral"}
                        >
                          {statusLabel(m.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/espacios/${slug}/equipo?tab=permisos&persona=${m.userId}`}
                          aria-label={tm.openPermissions(m.name)}
                          title={tm.openPermissions(m.name)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-text-secondary hover:bg-soft-surface hover:text-text"
                        >
                          <Icon name="chevronRight" className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M70 · Permisos                                                           */
/* ----------------------------------------------------------------------- */

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-text">{label}</p>
      <p className="rounded-[10px] border border-border bg-soft-surface px-3 py-2 text-sm text-text [overflow-wrap:anywhere]">
        {value}
      </p>
      {hint ? <p className="text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}

export function PermissionsTab({
  slug,
  spaceId,
  data,
  personId,
  history,
  timeZone,
}: {
  slug: string;
  spaceId: string;
  data: TeamData;
  personId: string | null;
  /** `null` si no se pudo leer; no se pide si no hay persona elegida. */
  history: readonly HistoryEntry[] | null;
  timeZone: string;
}) {
  const tp = t.permissions;
  const person = personId
    ? data.members.find((m) => m.userId === personId)
    : undefined;

  // Sin persona: la lista para elegir, que es lo que M70 hace desde M69.
  if (!person) {
    return (
      <Card
        title={personId ? tp.notFound : tp.chooseTitle}
        subtitle={tp.chooseReason}
      >
        <ul className="divide-y divide-border">
          {data.members.map((m) => (
            <li key={m.userId}>
              <Link
                href={`/espacios/${slug}/equipo?tab=permisos&persona=${m.userId}`}
                className="flex items-center justify-between gap-3 py-3 hover:text-cuotly-green"
              >
                <MemberCell member={m} />
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={roleTone(m.role)}>
                    {roleLabel(m.role)}
                  </StatusBadge>
                  <Icon
                    name="chevronRight"
                    className="h-4 w-4 text-text-secondary"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  const names = nameMap(data.members);
  const supervisor = supervisorOf(data, person.userId, names);
  const esTrabajador = person.role === "worker";
  const esAdmin = person.role === "admin";
  const realiza = canPerformJobs(person.role, person.adminCanPerformJobs);
  const autorizados = authorizedEstablishments(
    person.role,
    person.establishmentIds,
  );
  // Decisión 80 · a quien ya está fuera del equipo no se le cambian los
  // permisos: volvería a tenerlos si se le invita de nuevo, y RN-ASG-01
  // dice que una autorización nunca se da por defecto.
  const retirada = memberRemoval(person.role, person.status, true) === "removed";
  const editEstablishments = data.caps.assignJobs && esTrabajador && !retirada;
  const editSpecialties = data.caps.assignJobs && realiza && !retirada;
  const editAdminFlags = data.caps.manageSpace && esAdmin && !retirada;
  const removal = memberRemoval(person.role, person.status, data.caps.manageSpace);
  // A una persona retirada no se le explica quién cambia sus permisos:
  // no se le cambian, y la tarjeta de abajo dice por qué.
  const soloLectura =
    !retirada && !editEstablishments && !editSpecialties && !editAdminFlags;
  const yesNo = (v: boolean) => (v ? tp.yes : tp.no);

  const general = (
    <Card title={tp.generalTitle}>
      <div className="space-y-4">
        <ReadOnlyField label={tp.nameLabel} value={person.name} />
        <ReadOnlyField label={tp.emailLabel} value={person.email ?? "—"} />
        <ReadOnlyField
          label={tp.roleLabel}
          value={roleLabel(person.role)}
          hint={tp.roleHint}
        />
        {esTrabajador ? (
          <ReadOnlyField
            label={tp.supervisorLabel}
            value={supervisor.principal ?? t.noPrincipal}
            hint={tp.supervisorHint}
          />
        ) : null}
        <ReadOnlyField
          label={tp.sinceLabel}
          value={enZona(person.since, timeZone, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        />
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-semibold text-text">
            {tp.accessTitle}
          </p>
          <dl className="space-y-2 text-sm">
            {[
              [tp.accessPerformJobs, yesNo(realiza)],
              [
                tp.accessApproveReports,
                yesNo(
                  person.role === "owner" ||
                    (esAdmin && person.canApproveReports),
                ),
              ],
              [
                tp.accessEstablishments,
                autorizados.all
                  ? t.members.allEstablishments(data.establishments.length)
                  : String(autorizados.ids.length),
              ],
              [
                tp.accessSpecialties,
                realiza ? String(person.specialties.length) : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3"
              >
                <dt className="text-text-secondary">{label}</dt>
                <dd className="font-semibold text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  );

  const historial = (
    <Card title={tp.historyTitle}>
      {history === null ? (
        <p className="text-sm text-danger">{tp.historyFailed}</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-text-secondary">{tp.historyEmpty}</p>
      ) : (
        <ol className="divide-y divide-border">
          {history.map((h) => (
            <li
              key={h.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-2.5 text-sm"
            >
              <span className="whitespace-nowrap text-text-secondary">
                {enZona(h.at, timeZone, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </span>
              <span className="min-w-0">
                <span className="block text-text">
                  {(
                    es.settings.auditActions as Readonly<Record<string, string>>
                  )[h.action as AuditKey] ?? h.action}
                </span>
                <span className="block text-xs text-text-secondary">
                  {tp.historyBy(
                    h.actorId
                      ? (names.get(h.actorId) ?? "—")
                      : tp.historySystem,
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface p-5 shadow-sm">
        <span className="flex min-w-0 items-center gap-4">
          <Avatar name={person.name} size={56} />
          <span className="min-w-0">
            <span className="block truncate text-xl font-bold text-primary-dark">
              {person.name}
            </span>
            <span className="block text-sm text-text-secondary">
              {roleLabel(person.role)}
            </span>
          </span>
          <StatusBadge
            tone={person.status === "active" ? "success" : "neutral"}
          >
            {statusLabel(person.status)}
          </StatusBadge>
        </span>
        {soloLectura ? (
          <div
            role="note"
            className="flex max-w-xl items-start gap-3 rounded-[10px] bg-info/10 px-4 py-3 text-sm"
          >
            <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
            <span>
              <span className="block font-semibold text-text">
                {tp.readOnlyTitle}
              </span>
              <span className="block text-text-secondary">
                {tp.readOnlyReason}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <PermissionsForm
        key={person.userId}
        spaceId={spaceId}
        userId={person.userId}
        establishments={data.establishments}
        selectedEstablishments={person.establishmentIds}
        editEstablishments={editEstablishments}
        byRole={!esTrabajador}
        selectedSpecialties={person.specialties}
        editSpecialties={editSpecialties}
        specialtiesApply={realiza}
        adminFlags={
          esAdmin
            ? {
                performJobs: person.adminCanPerformJobs,
                approveReports: person.canApproveReports,
              }
            : null
        }
        editAdminFlags={editAdminFlags}
        general={general}
        history={historial}
      />

      {removal !== null ? (
        <RemoveMemberCard
          key={`retirar-${person.userId}`}
          spaceId={spaceId}
          slug={slug}
          userId={person.userId}
          name={person.name}
          mode={removal}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M71 · Invitaciones                                                       */
/* ----------------------------------------------------------------------- */

export function InvitationsTab({
  spaceId,
  slug,
  canInvite,
  invitations,
  timeZone,
  now,
}: {
  spaceId: string;
  slug: string;
  canInvite: boolean;
  /** `null` si la lectura falló. */
  invitations: readonly PendingInvitation[] | null;
  timeZone: string;
  now: Date;
}) {
  const ti = t.invitations;
  if (!canInvite) {
    return (
      <NoPermissionState
        title={ti.noPermissionTitle}
        description={ti.noPermissionReason}
      />
    );
  }
  const dia = (v: string) =>
    enZona(v, timeZone, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <Card title={ti.pendingTitle}>
        {invitations === null ? (
          <EmptyReason reason="error" title={ti.failed} />
        ) : invitations.length === 0 ? (
          <EmptyReason reason="no_data_yet" title={ti.emptyTitle} />
        ) : (
          <div
            className="relative overflow-x-auto"
            data-testid="equipo-invitaciones"
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{ti.emailColumn}</TableHeaderCell>
                  <TableHeaderCell>{ti.roleColumn}</TableHeaderCell>
                  <TableHeaderCell>{ti.sentColumn}</TableHeaderCell>
                  <TableHeaderCell>{ti.expiresColumn}</TableHeaderCell>
                  <TableHeaderCell>{ti.actionsColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.map((inv) => {
                  const caducada = invitationExpired(inv.expiresAt, now);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="text-sm text-text [overflow-wrap:anywhere]">
                          {inv.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-text-secondary">
                          {roleLabel(inv.role)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="whitespace-nowrap text-sm text-text-secondary">
                          {dia(inv.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="whitespace-nowrap text-sm text-text-secondary">
                          {caducada ? (
                            <StatusBadge tone="danger">
                              {ti.expired}
                            </StatusBadge>
                          ) : (
                            dia(inv.expiresAt)
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-start gap-2">
                          {caducada ? null : (
                            <CopyInviteLinkButton token={inv.token} />
                          )}
                          <CancelInvitationButton invitationId={inv.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {invitations && invitations.length > 0 ? (
          <p className="mt-3 text-xs text-text-secondary">{ti.noEmail}</p>
        ) : null}
      </Card>

      <Card title={ti.inviteTitle}>
        <InviteMemberForm spaceId={spaceId} spaceSlug={slug} inline />
        <div
          role="note"
          className="mt-4 flex items-start gap-3 rounded-[10px] bg-info/10 px-4 py-3 text-sm text-text"
        >
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <span>{ti.noAutoAccess}</span>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M72 · Supervisión y disponibilidad                                       */
/* ----------------------------------------------------------------------- */

const DOT: Record<DayStatus, string> = {
  available: "bg-success",
  absent: "bg-danger",
  absence_requested: "border-2 border-danger bg-surface",
  unavailable: "bg-border",
};

function WeekGrid({
  slug,
  week,
  people,
  absences,
}: {
  slug: string;
  week: string;
  people: readonly TeamMember[];
  absences: readonly AbsenceRow[];
}) {
  const ts = t.supervision;
  const days = weekDays(week);
  const base = `/espacios/${slug}/equipo?tab=supervision`;
  const cabecera = (d: string) =>
    enZona(d, "UTC", { weekday: "short", day: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <Link
          href={`${base}&semana=${shiftWeek(week, -1)}`}
          aria-label={ts.previousWeek}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-text-secondary hover:bg-soft-surface"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
        </Link>
        <p className="text-sm font-semibold text-text">
          {ts.weekOf(
            fechaCorta(days[0]),
            enZona(days[6], "UTC", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
          )}
        </p>
        <Link
          href={`${base}&semana=${shiftWeek(week, 1)}`}
          aria-label={ts.nextWeek}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-text-secondary hover:bg-soft-surface"
        >
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>

      {people.length === 0 ? (
        <EmptyReason reason="no_data_yet" title={ts.noWorkers} />
      ) : (
        <div
          className="relative overflow-x-auto"
          data-testid="equipo-disponibilidad"
        >
          <Table stack={false}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.members.memberColumn}</TableHeaderCell>
                {days.map((d) => (
                  <TableHeaderCell key={d}>
                    {/* En el teléfono, el día de la semana encima del
                        número: así caben las siete columnas (PDF, p. 93). */}
                    <span className="block text-center capitalize">
                      <span className="block sm:inline">
                        {enZona(d, "UTC", { weekday: "short" })}
                      </span>{" "}
                      <span className="block sm:inline">
                        {enZona(d, "UTC", { day: "numeric" })}
                      </span>
                    </span>
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.userId}>
                  <TableCell>
                    <div className="text-xs text-text [overflow-wrap:anywhere] sm:whitespace-nowrap sm:text-sm">
                      {p.name}
                    </div>
                  </TableCell>
                  {days.map((d) => {
                    const estado = dayStatus(
                      d,
                      p.userId,
                      absences,
                      p.available,
                    );
                    return (
                      <TableCell key={d}>
                        <span className="block text-center">
                          <span
                            role="img"
                            aria-label={`${p.name}, ${cabecera(d)}: ${ts.dayStatus[estado]}`}
                            title={ts.dayStatus[estado]}
                            className={`inline-block h-3 w-3 rounded-full ${DOT[estado]}`}
                          />
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
        {(Object.keys(DOT) as DayStatus[]).map((k) => (
          <li key={k} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[k]}`}
            />
            {ts.dayStatus[k]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-secondary">{ts.availabilityIntro}</p>
    </div>
  );
}

export function SupervisionTab({
  slug,
  data,
  week,
  today,
  absences,
  reassignments,
  supervisionForms,
  timeZone,
}: {
  slug: string;
  data: TeamData;
  week: string;
  today: string;
  absences: readonly AbsenceRow[] | null;
  reassignments: readonly PendingReassignment[] | null;
  /** Los formularios de HU-29, que ya existían y se pintan tal cual. */
  supervisionForms: ReactNode;
  timeZone: string;
}) {
  const ts = t.supervision;
  const names = nameMap(data.members);
  // En la cuadrícula, quien realiza trabajos: es a quien afecta planificar.
  const people = data.members.filter(
    (m) =>
      m.status === "active" && canPerformJobs(m.role, m.adminCanPerformJobs),
  );
  const proximas = absences ? upcomingAbsences(absences, today) : null;
  const absenceStates = es.calendar.absenceStates as Readonly<
    Record<string, string>
  >;
  const rango = (a: AbsenceRow) =>
    a.startsOn === a.endsOn
      ? fechaCorta(a.startsOn)
      : `${fechaCorta(a.startsOn)} – ${fechaCorta(a.endsOn)}`;

  return (
    <div className="space-y-4">
      <Card title={ts.coverageTitle}>
        {supervisionForms}
        <div
          role="note"
          className="mt-4 flex items-start gap-3 rounded-[10px] bg-info/10 px-4 py-3 text-sm text-text"
        >
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <span>{ts.coverageNotice}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={ts.availabilityTitle} className="min-w-0">
          <WeekGrid
            slug={slug}
            week={week}
            people={people}
            absences={absences ?? []}
          />
          {absences === null ? (
            <p className="mt-3 text-sm text-danger">{ts.absencesFailed}</p>
          ) : null}
        </Card>

        <div className="min-w-0 space-y-4">
          <Card title={ts.absencesTitle}>
            {proximas === null ? (
              <EmptyReason reason="error" title={ts.absencesFailed} />
            ) : proximas.length === 0 ? (
              <EmptyReason reason="no_data_yet" title={ts.absencesEmpty} />
            ) : (
              <div className="relative overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>
                        {t.members.memberColumn}
                      </TableHeaderCell>
                      <TableHeaderCell>{ts.datesColumn}</TableHeaderCell>
                      <TableHeaderCell>{ts.reasonColumn}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {proximas.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="text-sm text-text">
                            {names.get(a.userId) ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="whitespace-nowrap text-sm text-text-secondary">
                            {rango(a)}
                            {a.state === "requested" ? (
                              <span className="block text-xs">
                                {absenceStates[a.state] ?? a.state}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-32 text-sm text-text-secondary">
                            {a.reason ?? ts.noReason}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card title={ts.reassignmentsTitle}>
            {reassignments === null ? (
              <EmptyReason reason="error" title={ts.reassignmentsFailed} />
            ) : reassignments.length === 0 ? (
              <EmptyReason reason="no_data_yet" title={ts.reassignmentsEmpty} />
            ) : (
              <ul
                className="divide-y divide-border"
                data-testid="equipo-reasignaciones"
              >
                {reassignments.map((r) => (
                  <li
                    key={`${r.kind}-${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="block font-semibold text-text [overflow-wrap:anywhere]">
                        {r.kind === "task" ? ts.kindTask : ts.kindJob} ·{" "}
                        {r.label}
                      </span>
                      <span className="block text-xs text-text-secondary">
                        {r.personId ? (names.get(r.personId) ?? "—") : "—"}
                        {r.at
                          ? ` · ${enZona(r.at, timeZone, { day: "numeric", month: "short" })}`
                          : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge tone="warning">{ts.pending}</StatusBadge>
                      <ButtonLink href={r.href} variant="outline" size="sm">
                        {ts.open}
                      </ButtonLink>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
