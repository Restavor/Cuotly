import {
  addBusinessMinutes,
  contractualCalendar,
  holidaysKnownAsOf,
  type HolidayRecord,
} from "@/core/business-clock";
import type { ChangeCategory } from "@/core/consumption-ledger";
import { JOB_LOAD_POINTS } from "@/core/load-points";
import { jobDeadlineCondition, t2Status, t3Status, type CounterStatus } from "@/core/sla-timers";
import type { JobState } from "@/core/job-states";
import { isCounterRunning, type TimerEvent, type TimerEventType } from "@/core/timer-events";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * La información operativa de un trabajo: sus dos contadores y lo que
 * cuesta (§20.4). Es el equivalente para T2/T3 de lo que
 * `detail-load.ts` hace con T1 en una solicitud, y por lo mismo: los
 * contadores **se recalculan desde sus eventos**, nunca se leen de un
 * campo mutable (CA-10, RN-DAT-05).
 *
 * Aquí no hay ni un umbral ni una regla: los plazos los deciden
 * `t2DurationHours()` y `t3DurationHours()` en `src/core/sla-timers.ts`, y
 * los puntos, `JOB_LOAD_POINTS`. Si apareciera un número de negocio en
 * este archivo, estaría en el sitio equivocado (CLAUDE.md).
 */
export interface JobTimers {
  /** RN-SLA-05 · inicio operativo. `null` si el trabajo aún no se asignó. */
  readonly t2: CounterStatus | null;
  /** `true` cuando T2 ya se cerró porque el trabajo comenzó. */
  readonly t2Done: boolean;
  /** RN-SLA-11 · ejecución. `null` mientras no haya comenzado. */
  readonly t3: CounterStatus | null;
  /** RN-SLA-17 · condición calculada que convive con el estado, no lo sustituye. */
  readonly outOfDeadline: boolean;
  /** Qué contador manda en este estado, para no enseñar el que no toca. */
  readonly counter: "t2" | "t3" | null;
  /** RN-ASG-04 · lo que este trabajo pesa en la carga de quien lo lleva. */
  readonly loadPoints: number | null;
  /** `true` si T3 llegó a arrancar alguna vez. Lo dice su libro de eventos, no el estado. */
  readonly t3Started: boolean;
  /**
   * Maqueta 06 · cuándo vencería T3 si el contador siguiera corriendo,
   * medido en el reloj laborable del espacio (no en horas naturales: 48 h
   * laborables desde un viernes no son el domingo).
   *
   * Es `null` en cuanto el contador NO corre —en pausa, bloqueado o ya
   * parado—, porque entonces la fecha se desplazaría sola y afirmarla
   * sería mentir (RN-SLA-14). Quién traduce ese `null` a un motivo legible
   * es `jobEnd()` en `src/core/job-execution.ts`, que distingue los seis
   * casos; aquí solo se calcula el instante.
   */
  readonly t3DeadlineAt: Date | null;
}

function toTimerEvents(
  rows: readonly { readonly event_type: string; readonly occurred_at: string }[],
): readonly TimerEvent[] {
  return rows.map((row) => ({
    type: row.event_type as TimerEventType,
    occurredAt: new Date(row.occurred_at),
  }));
}

/**
 * RN-CLK-10 · el calendario se construye con los festivos que se conocían
 * cuando arrancó el contador, no con los de hoy: cambiar un festivo hoy no
 * puede mover hacia atrás un plazo que ya corría.
 */
function statusFrom(
  events: readonly TimerEvent[],
  holidays: readonly HolidayRecord[],
  timezone: string,
  calcular: (events: readonly TimerEvent[], calendar: ReturnType<typeof contractualCalendar>) => CounterStatus,
): CounterStatus | null {
  if (events.length === 0) return null;

  const startedAt = events.map((e) => e.occurredAt).reduce((a, b) => (a < b ? a : b));
  return calcular(events, contractualCalendar(timezone, holidaysKnownAsOf(holidays, startedAt)));
}

export async function loadJobTimers(
  supabase: Supabase,
  job: {
    readonly id: string;
    readonly space_id: string;
    readonly state: string;
    readonly category: string | null;
  },
  now: Date = new Date(),
): Promise<JobTimers> {
  const [{ data: space }, { data: eventRows }, { data: holidayRows }, { data: subscription }] =
    await Promise.all([
      supabase.from("spaces").select("timezone").eq("id", job.space_id).maybeSingle(),
      supabase
        .from("timer_events")
        .select("event_type, occurred_at, counter_kind")
        .eq("entity_type", "job")
        .eq("entity_id", job.id)
        .order("occurred_at", { ascending: true }),
      supabase.from("holidays").select("holiday_date, created_at").eq("space_id", job.space_id),
      // RN-SLA-06 · la duración de T2 la decide el plan vigente, no se
      // supone aquí. Sin plan activo son 48 h, que es como se comporta
      // Básico (RN-COM-12).
      supabase
        .from("subscriptions")
        .select("plans (start_sla_hours)")
        .eq("space_id", job.space_id)
        .eq("kind", "plan")
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);

  const timezone = space?.timezone ?? "Europe/Madrid";
  const holidays: readonly HolidayRecord[] = (holidayRows ?? []).map((row) => ({
    date: row.holiday_date,
    configuredAt: new Date(row.created_at),
  }));

  const acceleratedSla = (subscription?.plans?.start_sla_hours ?? 48) < 48;

  const t2Events = toTimerEvents((eventRows ?? []).filter((r) => r.counter_kind === "t2"));
  const t3Events = toTimerEvents((eventRows ?? []).filter((r) => r.counter_kind === "t3"));

  const t2 = statusFrom(t2Events, holidays, timezone, (events, calendar) =>
    t2Status(events, calendar, now, acceleratedSla),
  );

  // Sin categoría validada no hay plazo de ejecución que calcular: T3 lo
  // fija la categoría (RN-SLA-12), y suponerle una sería inventarse el
  // plazo.
  const t3 =
    job.category === null
      ? null
      : statusFrom(t3Events, holidays, timezone, (events, calendar) =>
          t3Status(events, calendar, now, job.category as ChangeCategory),
        );

  const condition = jobDeadlineCondition(job.state as JobState, {
    t2: t2 ?? undefined,
    t3: t3 ?? undefined,
  });

  // Maqueta 06 · "Fecha estimada de fin". Se proyecta desde AHORA con los
  // minutos laborables que quedan, y solo mientras el contador corra: en
  // pausa, `remainingMinutes` se conserva (RN-SLA-14) y sumárselo a "ahora"
  // daría una fecha distinta en cada recarga.
  //
  // El calendario se construye con los festivos conocidos cuando arrancó
  // T3, igual que el que usó `t3Status()` para medirlo: dos calendarios
  // distintos para el mismo contador darían un plazo y una fecha que no
  // coinciden (RN-CLK-10).
  const t3StartedAt =
    t3Events.length === 0
      ? null
      : t3Events.map((e) => e.occurredAt).reduce((a, b) => (a < b ? a : b));

  const t3DeadlineAt =
    t3 === null || t3StartedAt === null || !isCounterRunning(t3Events)
      ? null
      : addBusinessMinutes(
          now,
          t3.remainingMinutes,
          contractualCalendar(timezone, holidaysKnownAsOf(holidays, t3StartedAt)),
        );

  return {
    t2,
    // T2 se cierra al comenzar: a partir de ahí lo que corre es T3, y el
    // inicio operativo se lee como cumplido en vez de como un plazo vivo.
    t2Done: t3Events.length > 0,
    t3,
    outOfDeadline: condition.outOfDeadline,
    counter: condition.counter,
    loadPoints: job.category === null ? null : JOB_LOAD_POINTS[job.category as ChangeCategory],
    t3Started: t3Events.length > 0,
    t3DeadlineAt,
  };
}
