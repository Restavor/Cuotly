import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
import { todayInTimeZone } from "@/core/finance";
import { monthBounds, shiftMonth, spanDays } from "@/core/team-calendar";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { AbsenceDecision, AvailabilityForm } from "./CalendarForms";

/**
 * Calendario operativo del espacio: HU-30 (declarar disponibilidad y pedir
 * una ausencia), HU-31 (aprobarla y ver qué trabajos quedan sin cobertura)
 * y HU-32 (festivos y cierres, con auditoría).
 *
 * Los eventos se DERIVAN: `space_calendar()` los saca de `holidays`,
 * `absences`, `jobs` y `charges` en vez de mantener una tabla de eventos
 * que pudiera discrepar de los datos (RN-DAT-05).
 *
 * Esta pantalla no autoriza nada. `space_calendar()` es SECURITY INVOKER,
 * de modo que lo que devuelve ya está filtrado por las políticas de RLS de
 * cada tabla con la identidad de quien mira; y las capacidades que se
 * consultan aquí solo deciden qué formularios se pintan — quién puede
 * ejecutarlos lo vuelven a comprobar `decide_absence()`,
 * `request_absence()` y la política de INSERT de `holidays`.
 *
 * El cliente no llega aquí: no es miembro del espacio, así que `absences`
 * le devuelve cero filas (P7, la organización interna del equipo no es
 * suya) y el armazón no le pinta este destino.
 */
export const dynamic = "force-dynamic";

type EventKind = keyof typeof es.calendar.kinds;
type AbsenceStateKey = keyof typeof es.calendar.absenceStates;

function kindLabel(kind: string): string {
  return kind in es.calendar.kinds ? es.calendar.kinds[kind as EventKind] : kind;
}

function absenceTone(state: string): "success" | "warning" | "danger" | "neutral" {
  if (state === "approved") return "success";
  if (state === "rejected" || state === "cancelled") return "danger";
  if (state === "requested") return "warning";
  return "neutral";
}

/** El nombre visible de alguien del equipo, con el correo como respaldo. */
function personName(profile: { full_name: string | null; email: string | null } | null): string {
  return profile?.full_name ?? profile?.email ?? "—";
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const { slug } = await params;
  const { dia } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  // El mes que se mira sale de la URL; por defecto, el mes de HOY en la
  // zona del ESPACIO (CLAUDE.md MUST) y no en la del servidor, que en
  // Vercel es UTC y le correría el día a cualquier espacio al este.
  const hoy = todayInTimeZone(new Date(), space.timezone);
  const anclaje = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoy;
  const { from, to } = monthBounds(anclaje);
  const [anio, mes] = anclaje.split("-").map(Number);

  const [
    { data: eventos, error: eventosError },
    { data: puedeDecidir },
    { data: puedeFestivos },
    { data: realizaTrabajos },
    { data: disponibilidad },
    { data: pendientes },
    { data: misAusencias },
  ] = await Promise.all([
    supabase.rpc("space_calendar", { p_space_id: space.id, p_from: from, p_to: to }),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_absences" }),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_holidays" }),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "perform_jobs" }),
    supabase
      .from("worker_availability")
      .select("available, note")
      .eq("space_id", space.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("absences")
      // `absences` tiene DOS claves ajenas a `profiles` —quién falta y
      // quién lo decidió—, así que hay que decir por cuál se une o
      // PostgREST no adivina. Aquí interesa la persona ausente.
      .select(
        "id, user_id, starts_on, ends_on, reason, state, profiles!absences_user_id_fkey (full_name, email)",
      )
      .eq("space_id", space.id)
      .eq("state", "requested")
      .order("starts_on"),
    supabase
      .from("absences")
      .select("id, starts_on, ends_on, state, decision_note")
      .eq("space_id", space.id)
      .eq("user_id", user.id)
      .order("starts_on", { ascending: false })
      .limit(20),
  ]);

  // HU-31 · "…y ver qué trabajos quedan sin cobertura". Se pregunta una vez
  // por ausencia pendiente y solo si se puede decidir: la función lanza a
  // quien no tenga `manage_absences`, y llamarla igualmente solo serviría
  // para llenar el registro de errores.
  const sinCobertura = new Map<string, { code: string; establishment_name: string }[]>();
  if (puedeDecidir === true && pendientes) {
    await Promise.all(
      pendientes.map(async (ausencia) => {
        const { data } = await supabase.rpc("uncovered_jobs_for_absence", {
          p_absence_id: ausencia.id,
        });
        sinCobertura.set(ausencia.id, data ?? []);
      }),
    );
  }

  const mesAnterior = shiftMonth(anclaje, -1);
  const mesSiguiente = shiftMonth(anclaje, 1);
  const base = `/espacios/${space.slug}/calendario`;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary-dark">{es.calendar.title}</h1>
        <p className="text-sm text-text-secondary">{es.calendar.timeZoneHint(space.timezone)}</p>
      </header>

      <Card
        title={es.calendar.monthTitle(es.calendar.months[mes - 1], anio)}
        className="space-y-4"
      >
        <nav aria-label={es.calendar.title} className="flex flex-wrap gap-3 text-sm">
          <Link href={`${base}?dia=${mesAnterior}`} className="text-cuotly-green underline">
            ← {es.calendar.previousMonth}
          </Link>
          <Link href={`${base}?dia=${hoy}`} className="text-cuotly-green underline">
            {es.calendar.today}
          </Link>
          <Link href={`${base}?dia=${mesSiguiente}`} className="text-cuotly-green underline">
            {es.calendar.nextMonth} →
          </Link>
        </nav>

        {eventosError ? (
          <EmptyState title={es.states.errorTitle} description={es.emptyReasons.error} />
        ) : eventos && eventos.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableHeaderCell>{es.calendar.dateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.calendar.kindColumn}</TableHeaderCell>
                <TableHeaderCell>{es.calendar.detailColumn}</TableHeaderCell>
                <TableHeaderCell>{es.calendar.stateColumn}</TableHeaderCell>
              </TableHead>
              <TableBody>
                {eventos.map((evento, i) => (
                  <TableRow key={`${evento.entity_id}-${evento.event_date}-${i}`}>
                    <TableCell>{evento.event_date}</TableCell>
                    <TableCell>{kindLabel(evento.kind)}</TableCell>
                    <TableCell>{evento.title || es.calendar.noDetail}</TableCell>
                    <TableCell>
                      {evento.state ? (
                        <StatusBadge tone={absenceTone(evento.state)}>
                          {evento.kind === "absence" && evento.state in es.calendar.absenceStates
                            ? es.calendar.absenceStates[evento.state as AbsenceStateKey]
                            : evento.state}
                        </StatusBadge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title={es.calendar.emptyTitle} description={es.calendar.emptyReason} />
        )}
      </Card>

      {/* HU-31 · decidir las ausencias que esperan. */}
      {puedeDecidir === true ? (
        <Card title={es.calendar.pendingTitle} className="space-y-6">
          {pendientes && pendientes.length > 0 ? (
            pendientes.map((ausencia) => {
              const trabajos = sinCobertura.get(ausencia.id) ?? [];
              return (
                <div key={ausencia.id} className="space-y-3 border-b border-border pb-6 last:border-0 last:pb-0">
                  <div>
                    <p className="font-semibold text-text">{personName(ausencia.profiles)}</p>
                    <p className="text-sm text-text-secondary">
                      {es.calendar.absenceRange(
                        ausencia.starts_on,
                        ausencia.ends_on,
                        spanDays(ausencia.starts_on, ausencia.ends_on),
                      )}
                    </p>
                    {ausencia.reason ? (
                      <p className="mt-1 text-sm text-text">{ausencia.reason}</p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-text">{es.calendar.uncoveredTitle}</p>
                    {trabajos.length > 0 ? (
                      <>
                        <ul className="mt-1 list-disc pl-5 text-sm text-text">
                          {trabajos.map((trabajo) => (
                            <li key={trabajo.code}>
                              {trabajo.code} · {trabajo.establishment_name}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 text-sm text-text-secondary">
                          {es.calendar.uncoveredHint}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-text-secondary">
                        {es.calendar.uncoveredEmpty}
                      </p>
                    )}
                  </div>

                  <AbsenceDecision absenceId={ausencia.id} />
                </div>
              );
            })
          ) : (
            <EmptyState title={es.calendar.pendingTitle} description={es.calendar.pendingEmpty} />
          )}
        </Card>
      ) : null}

      {/* HU-30 · lo que declara quien realiza trabajos. */}
      <Card title={es.calendar.availabilityTitle} className="space-y-4">
        <p className="text-sm text-text-secondary">{es.calendar.availabilityHint}</p>
        {realizaTrabajos === true ? (
          <>
            <AvailabilityForm
              spaceId={space.id}
              available={disponibilidad?.available ?? true}
              note={disponibilidad?.note ?? ""}
            />
            <div>
              <p className="mb-2 text-sm font-semibold text-text">{es.calendar.myAbsencesTitle}</p>
              {misAusencias && misAusencias.length > 0 ? (
                <Table>
                  <TableHead>
                    <TableHeaderCell>{es.calendar.pendingRangeColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.calendar.stateColumn}</TableHeaderCell>
                  </TableHead>
                  <TableBody>
                    {misAusencias.map((ausencia) => (
                      <TableRow key={ausencia.id}>
                        <TableCell>
                          {es.calendar.absenceRange(
                            ausencia.starts_on,
                            ausencia.ends_on,
                            spanDays(ausencia.starts_on, ausencia.ends_on),
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={absenceTone(ausencia.state)}>
                            {ausencia.state in es.calendar.absenceStates
                              ? es.calendar.absenceStates[ausencia.state as AbsenceStateKey]
                              : ausencia.state}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-text-secondary">{es.calendar.myAbsencesEmpty}</p>
              )}
            </div>
            <Link href={`${base}/ausencia`} className="text-sm text-cuotly-green underline">
              {es.calendar.newAbsenceTitle}
            </Link>
          </>
        ) : (
          <p className="text-sm text-text-secondary">{es.calendar.availabilityNotWorker}</p>
        )}
      </Card>

      {puedeFestivos === true ? (
        <Card title={es.calendar.holidaysTitle} className="space-y-3">
          <p className="text-sm text-text-secondary">{es.calendar.newHolidayIntro}</p>
          <Link href={`${base}/festivo`} className="text-sm text-cuotly-green underline">
            {es.calendar.newHolidayTitle}
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
