/**
 * Lógica pura de las cuatro pestañas de Equipo (M69 a M72): qué pestaña
 * se pide, las cifras de arriba, la semana de disponibilidad y las
 * ausencias próximas.
 *
 * Sin Supabase, sin Next y sin React (CLAUDE.md). Todo lo que aquí se
 * llama "día" es una fecha civil `YYYY-MM-DD` en la zona del espacio,
 * igual que en `team-calendar.ts`.
 */

import { isCivilDay, nextDay } from "./team-calendar";

export const TEAM_TABS = ["miembros", "permisos", "invitaciones", "supervision"] as const;
export type TeamTab = (typeof TEAM_TABS)[number];

export interface TeamParams {
  readonly tab: TeamTab;
  /** La persona de Permisos (M70), si se eligió una. */
  readonly person: string | null;
  /** El lunes de la semana de disponibilidad (M72). */
  readonly week: string;
}

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v !== "" ? v : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee `?tab=`, `?persona=` y `?semana=`. Lo que no se entiende cae en el
 * valor por defecto en vez de romper la pantalla: la pestaña de miembros,
 * nadie elegido y la semana de hoy.
 */
export function readTeamParams(
  query: Record<string, string | string[] | undefined>,
  today: string,
): TeamParams {
  const tab = first(query.tab);
  const person = first(query.persona);
  const week = first(query.semana);
  return {
    tab: tab !== null && (TEAM_TABS as readonly string[]).includes(tab) ? (tab as TeamTab) : "miembros",
    person: person !== null && UUID.test(person) ? person : null,
    week: mondayOf(week !== null && isCivilDay(week) ? week : today),
  };
}

function toUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** El lunes de la semana de `day` (la semana empieza en lunes en España). */
export function mondayOf(day: string): string {
  const date = toUtc(day);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return fromUtc(date);
}

/** El mismo lunes desplazado `delta` semanas. */
export function shiftWeek(monday: string, delta: number): string {
  const date = toUtc(monday);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return fromUtc(date);
}

/** Los siete días de la semana que empieza en `monday`. */
export function weekDays(monday: string): readonly string[] {
  const days: string[] = [monday];
  while (days.length < 7) days.push(nextDay(days[days.length - 1]));
  return days;
}

export interface RosterMember {
  readonly role: string;
  readonly status: string;
}

export interface TeamCounts {
  readonly members: number;
  readonly admins: number;
  readonly workers: number;
}

/**
 * M69 · las tres primeras cifras. Cuenta a los **activos**: un miembro
 * suspendido o dado de baja no forma parte del equipo de hoy. El
 * propietario cuenta como miembro pero no como administrador, que es lo
 * que dibuja el diseño (4 miembros, 1 administrador, 2 trabajadores).
 */
export function teamCounts(members: readonly RosterMember[]): TeamCounts {
  const active = members.filter((m) => m.status === "active");
  return {
    members: active.length,
    admins: active.filter((m) => m.role === "admin").length,
    workers: active.filter((m) => m.role === "worker").length,
  };
}

export interface AbsenceSpan {
  readonly userId: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly state: string;
}

/** Cómo está una persona un día concreto en la cuadrícula de M72. */
export type DayStatus = "available" | "absent" | "absence_requested" | "unavailable";

/**
 * RN-ASG-10 · no hay horario fijo por trabajador: cada uno declara si
 * está disponible, y esa declaración es **una** —la de ahora—, no un
 * horario por días. Por eso un día sin ausencia pinta lo que la persona
 * tiene declarado, y la cuadrícula no inventa fines de semana libres.
 *
 * Lo que sí es por día son las ausencias del calendario (HU-30): una
 * aprobada manda sobre todo, y una pedida se distingue porque todavía no
 * está decidida. Las rechazadas y canceladas no cuentan.
 */
export function dayStatus(
  day: string,
  userId: string,
  absences: readonly AbsenceSpan[],
  declaredAvailable: boolean,
): DayStatus {
  const mine = absences.filter((a) => a.userId === userId && a.startsOn <= day && day <= a.endsOn);
  if (mine.some((a) => a.state === "approved")) return "absent";
  if (mine.some((a) => a.state === "requested")) return "absence_requested";
  return declaredAvailable ? "available" : "unavailable";
}

/**
 * M72 · "Ausencias próximas": las pedidas o aprobadas que aún no han
 * terminado, de la que empieza antes a la que empieza después.
 */
export function upcomingAbsences<T extends AbsenceSpan>(absences: readonly T[], today: string): T[] {
  return absences
    .filter((a) => (a.state === "approved" || a.state === "requested") && a.endsOn >= today)
    .sort((a, b) => (a.startsOn === b.startsOn ? a.endsOn.localeCompare(b.endsOn) : a.startsOn.localeCompare(b.startsOn)));
}

/**
 * RN-ASG-01 · qué restaurantes tiene autorizados una persona. El
 * propietario y los administradores los gestionan todos por su rol (§4.2,
 * `worker_establishments` no lleva filas suyas), así que para ellos la
 * respuesta es "todos" y no la lista de filas, que estaría vacía.
 */
export function authorizedEstablishments(
  role: string,
  assigned: readonly string[],
): { readonly all: true } | { readonly all: false; readonly ids: readonly string[] } {
  return role === "worker" ? { all: false, ids: assigned } : { all: true };
}

/**
 * Si una persona puede realizar trabajos, con el mismo criterio que
 * `member_can_perform_jobs()` en la base: propietario y trabajador
 * siempre; un administrador, solo si se le ha concedido.
 */
export function canPerformJobs(role: string, adminFlag: boolean): boolean {
  return role === "owner" || role === "worker" || (role === "admin" && adminFlag);
}

/**
 * Una invitación pendiente cuya fecha de caducidad ya pasó sigue en la
 * base como `pending` hasta que alguien la toca: aquí se dice que ha
 * caducado, que es lo que le pasaría al abrir el enlace.
 */
export function invitationExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
