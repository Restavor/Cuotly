import Link from "next/link";

import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  NoPermissionState,
  StatusBadge,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { ProjectedDeadline } from "@/core/job-board";
import type { LoadLevel } from "@/core/load-points";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

const t = es.teamArea.jobs;

type Tone = "success" | "warning" | "info" | "neutral" | "danger";
type JobStateKey = keyof typeof es.naming.states.job;

/**
 * Donde empieza la carga "Muy alta" (§14.4, `loadLevel()`). La barra se
 * llena ahí, y no es un máximo: RN-ASG-15 dice que no lo hay. El "3 / 6"
 * del dibujo pintaba un tope que ninguna regla da.
 */
const BARRA_LLENA = 30;

const TONO_NIVEL: Readonly<
  Record<LoadLevel, "success" | "neutral" | "warning" | "danger">
> = {
  low: "success",
  normal: "neutral",
  high: "warning",
  very_high: "danger",
};

const RELLENO_NIVEL: Readonly<Record<LoadLevel, string>> = {
  low: "bg-cuotly-green",
  normal: "bg-cuotly-green",
  high: "bg-warning",
  very_high: "bg-danger",
};

export type WorkloadCard =
  | { readonly kind: "failed" }
  | { readonly kind: "no_permission" }
  | {
      readonly kind: "ok";
      readonly members: readonly {
        readonly userId: string;
        readonly name: string;
        readonly points: number;
        readonly level: LoadLevel;
      }[];
    };

export type DeadlineItem = {
  readonly id: string;
  readonly code: string;
  readonly title: string | null;
  readonly state: string;
  readonly establishment: string | null;
  readonly counter: "t2" | "t3";
  readonly deadline: ProjectedDeadline;
};

/**
 * M09 · las dos tarjetas de debajo de la bandeja (página 65): la carga de
 * cada persona del equipo y lo que vence antes.
 *
 * La carga llega en el orden del servidor, sin ordenar por puntos:
 * ordenarla sería el ranking que prohíbe RN-ASG-17. Los vencimientos los
 * proyecta el reloj laborable en el servidor (`projectDeadline()`); aquí
 * solo se pintan en la zona del espacio.
 */
export function JobsOverview({
  workload,
  deadlines,
  pausedCount,
  showAll,
  seeAllHref,
  teamHref,
  href,
  tone,
  timeZone,
  now,
}: {
  workload: WorkloadCard;
  /** `null` si los contadores no se han podido leer. */
  deadlines: readonly DeadlineItem[] | null;
  pausedCount: number;
  showAll: boolean;
  /** `null` cuando no hay más que enseñar. */
  seeAllHref: string | null;
  teamHref: string;
  href: (id: string) => string;
  tone: (state: string) => Tone;
  timeZone: string;
  now: Date;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
      <Card className="p-4! sm:p-5!">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-primary-dark">
            {t.workloadTitle}
          </h2>
          {workload.kind === "ok" && workload.members.length > 0 ? (
            <Link
              href={teamHref}
              className="shrink-0 text-sm font-semibold whitespace-nowrap text-cuotly-green hover:underline"
            >
              {t.workloadSeeDetail}
            </Link>
          ) : null}
        </header>
        {workload.kind === "failed" ? (
          <ErrorState />
        ) : workload.kind === "no_permission" ? (
          <NoPermissionState
            title={es.spaceHome.teamLoad.noPermissionTitle}
            description={es.spaceHome.teamLoad.noPermissionReason}
          />
        ) : workload.members.length === 0 ? (
          <EmptyState title={es.spaceHome.teamLoad.emptyTitle} />
        ) : (
          <>
            <ul className="flex flex-col">
              {workload.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 py-2.5">
                  <Avatar name={m.name} size={34} />
                  {/* Columnas de ancho fijo: si no, cada barra mide lo que
                      le dejan su nombre y su insignia, y se comparan mal. */}
                  <div className="grid min-w-0 flex-1 gap-x-3 gap-y-1.5 sm:grid-cols-[8rem_minmax(0,1fr)_13rem] sm:items-center">
                    <span className="truncate text-sm font-medium text-text">
                      {m.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-2 overflow-hidden rounded-full bg-soft-surface"
                    >
                      <span
                        className={`block h-full rounded-full ${RELLENO_NIVEL[m.level]}`}
                        style={{
                          width: `${Math.min(100, (m.points / BARRA_LLENA) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="flex items-center gap-2 sm:justify-end">
                      <span className="text-sm font-semibold whitespace-nowrap text-text">
                        {es.spaceHome.teamLoad.points(m.points)}
                      </span>
                      <StatusBadge tone={TONO_NIVEL[m.level]}>
                        {es.space.jobs.loadLevels[m.level]}
                      </StatusBadge>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-secondary">
              {t.workloadScale}
            </p>
          </>
        )}
      </Card>

      <Card className="p-4! sm:p-5!">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-primary-dark">
            {t.deadlinesTitle}
          </h2>
          {seeAllHref ? (
            <Link
              href={seeAllHref}
              className="shrink-0 text-sm font-semibold whitespace-nowrap text-cuotly-green hover:underline"
            >
              {showAll ? t.deadlinesSeeFewer : t.deadlinesSeeAll}
            </Link>
          ) : null}
        </header>
        {deadlines === null ? (
          <ErrorState
            title={t.deadlinesFailedTitle}
            description={t.deadlinesFailedReason}
          />
        ) : deadlines.length === 0 ? (
          <EmptyState
            title={t.deadlinesEmptyTitle}
            description={t.deadlinesEmptyReason}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {deadlines.map((d) => (
              <li key={d.id}>
                <Vencimiento
                  item={d}
                  href={href(d.id)}
                  tone={tone}
                  timeZone={timeZone}
                  now={now}
                />
              </li>
            ))}
          </ul>
        )}
        {deadlines !== null && pausedCount > 0 ? (
          <p className="mt-2 text-xs text-text-secondary">
            {t.deadlinesPaused(pausedCount)}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function Vencimiento({
  item,
  href,
  tone,
  timeZone,
  now,
}: {
  item: DeadlineItem;
  href: string;
  tone: (state: string) => Tone;
  timeZone: string;
  now: Date;
}) {
  const vencido = item.deadline.kind === "overdue";
  const cuando =
    item.deadline.kind === "at"
      ? fechaDelPlazo(item.deadline.at, timeZone, now)
      : null;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[10px] px-1 py-2.5 hover:bg-soft-surface"
    >
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          vencido ? "bg-danger/10 text-danger" : "bg-warning/20 text-text"
        }`}
      >
        <Icon name={vencido ? "alert" : "clock"} className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0 sm:w-44">
          {vencido ? (
            <StatusBadge tone="danger">
              {es.space.jobs.outOfDeadline}
            </StatusBadge>
          ) : (
            <span className="block text-sm font-semibold whitespace-nowrap text-text">
              {cuando}
            </span>
          )}
          <span className="block text-xs text-text-secondary">
            {t.deadlinesCounter[item.counter]}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">
            {item.title ?? item.code}
          </span>
          <span className="block truncate text-xs text-text-secondary">
            {item.title ? `${item.code} · ` : ""}
            {item.establishment ?? "—"}
          </span>
        </span>
      </span>
      <StatusBadge tone={tone(item.state)}>
        {es.naming.states.job[item.state as JobStateKey] ?? item.state}
      </StatusBadge>
    </Link>
  );
}

/** "Hoy, 18:00" o "16 sept 2026, 18:00", en la zona del espacio. */
function fechaDelPlazo(at: Date, timeZone: string, now: Date): string {
  const iso = at.toISOString();
  const hora = enZona(iso, timeZone, { hour: "2-digit", minute: "2-digit" });
  const dia = (valor: string) =>
    enZona(valor, timeZone, { dateStyle: "short" });
  if (dia(iso) === dia(now.toISOString())) return t.deadlinesToday(hora);
  return `${enZona(iso, timeZone, { day: "numeric", month: "short", year: "numeric" })}, ${hora}`;
}
