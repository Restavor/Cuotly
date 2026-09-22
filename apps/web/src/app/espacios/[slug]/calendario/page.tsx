import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { isMenuState, menuTone } from "@/core/menu-states";
import { monthBounds, shiftMonth, spanDays } from "@/core/team-calendar";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { jobTone } from "../trabajos/page";
import { AbsenceDecision, AvailabilityForm } from "./CalendarForms";

/**
 * Calendario operativo del espacio: HU-30 (declarar disponibilidad y pedir
 * una ausencia), HU-31 (aprobarla y ver qué trabajos quedan sin cobertura)
 * y HU-32 (festivos y cierres, con auditoría). Desde el Hito 12, el
 * calendario completo de §75 y §76: publicaciones de Menú Diario,
 * renovaciones de planes y servicios y final de sustituciones, con los
 * filtros de restaurante, trabajador y tipo de evento.
 *
 * Los eventos se DERIVAN: `space_calendar()` los saca de `holidays`,
 * `absences`, `jobs`, `charges`, `menus`, `subscriptions` y
 * `supervisions` en vez de mantener una tabla de eventos que pudiera
 * discrepar de los datos (RN-DAT-05). Los filtros van en la URL
 * (`?restaurante=&trabajador=&tipo=`) y los resuelve la función, no la
 * pantalla: así el mismo enlace enseña lo mismo a quien lo abra, dentro
 * de lo que RLS le deje ver.
 *
 * Los límites de comenzar y de ejecución de §76 NO están: se calculan con
 * el reloj laboral de `src/core/business-clock.ts`, que no existe en SQL,
 * y copiarlo sería el segundo reloj que CA-10 prohíbe. Se dice en la
 * pantalla en vez de callarlo.
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
type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** Los tipos de evento que la función devuelve, en el orden del filtro. */
const EVENT_KINDS = Object.keys(es.calendar.kinds) as readonly EventKind[];

function isEventKind(value: string): value is EventKind {
  return value in es.calendar.kinds;
}

/**
 * Se exporta porque el Inicio del espacio pinta las cinco primeras de
 * estas mismas filas ("Próximas tareas", página 22): la etiqueta de un
 * tipo de evento y a dónde lleva se deciden **una sola vez**, o las dos
 * pantallas acabarían discrepando sobre qué es y adónde va lo mismo.
 */
export function kindLabel(kind: string): string {
  return isEventKind(kind) ? es.calendar.kinds[kind] : kind;
}

function absenceTone(state: string): Tone {
  if (state === "approved") return "success";
  if (state === "rejected" || state === "cancelled") return "danger";
  if (state === "requested") return "warning";
  return "neutral";
}

/**
 * El nombre y el tono del estado de un evento, según de qué es. Cada tipo
 * tiene su catálogo (§76): el de una ausencia, el de un menú (§63), el de
 * un trabajo, el de un cobro (RN-FIN-02); en una renovación "estado" es
 * si renueva un plan o un servicio, y en una sustitución, su clase.
 */
function stateOf(kind: string, state: string): { readonly label: string; readonly tone: Tone } {
  switch (kind) {
    case "absence":
      return {
        label: state in es.calendar.absenceStates ? es.calendar.absenceStates[state as AbsenceStateKey] : state,
        tone: absenceTone(state),
      };
    case "menu_publication":
      return isMenuState(state)
        ? { label: es.naming.states.menu[state], tone: menuTone(state) }
        : { label: state, tone: "neutral" };
    case "correction_window":
      return {
        label: (es.naming.states.job as Readonly<Record<string, string>>)[state] ?? state,
        tone: jobTone(state),
      };
    case "charge_due":
      return {
        label: (es.teamArea.chargeStates as Readonly<Record<string, string>>)[state] ?? state,
        tone: state === "paid" || state === "waived" ? "success" : state === "overdue" ? "danger" : "neutral",
      };
    case "renewal":
      return {
        label: (es.calendar.renewalKinds as Readonly<Record<string, string>>)[state] ?? state,
        tone: "info",
      };
    case "supervision_end":
      return {
        label: (es.calendar.supervisionKinds as Readonly<Record<string, string>>)[state] ?? state,
        tone: "info",
      };
    default:
      return { label: state, tone: "neutral" };
  }
}

/**
 * A dónde lleva cada evento: a la ficha de lo que es. Un festivo o una
 * ausencia no tienen ficha propia (se gestionan desde aquí), y un cobro se
 * ve en Finanzas.
 */
export function eventHref(
  base: string,
  evento: { readonly entity_type: string; readonly entity_id: string; readonly establishment_id: string | null },
): string | null {
  switch (evento.entity_type) {
    case "menu":
      return `${base}/menu-diario/${evento.entity_id}`;
    case "job":
      return `${base}/trabajos/${evento.entity_id}`;
    case "charge":
      return `${base}/finanzas`;
    case "subscription":
      return evento.establishment_id === null ? null : `${base}/planes/${evento.establishment_id}`;
    case "supervision":
      return `${base}/equipo`;
    default:
      return null;
  }
}

/** Un identificador de la URL, o nada: lo que no sea un uuid no se manda. */
function uuidParam(value: string | undefined): string | undefined {
  return value !== undefined && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
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
  searchParams: Promise<{ dia?: string; restaurante?: string; trabajador?: string; tipo?: string }>;
}) {
  const { slug } = await params;
  const { dia, restaurante, trabajador, tipo } = await searchParams;
  const supabase = await createClient();

  // §75 · los tres filtros que resuelve el servidor. Un valor que no sea
  // válido se ignora en vez de mandarse: la función lo rechazaría con un
  // error de tipo que no dice nada a quien mira.
  const filtroRestaurante = uuidParam(restaurante);
  const filtroTrabajador = uuidParam(trabajador);
  const filtroTipo = tipo !== undefined && isEventKind(tipo) ? tipo : undefined;
  const hayFiltros =
    filtroRestaurante !== undefined || filtroTrabajador !== undefined || filtroTipo !== undefined;

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
    { data: restaurantes },
    { data: miembros },
  ] = await Promise.all([
    supabase.rpc("space_calendar", {
      p_space_id: space.id,
      p_from: from,
      p_to: to,
      p_establishment_id: filtroRestaurante,
      p_worker_id: filtroTrabajador,
      p_kind: filtroTipo,
    }),
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
    // Las opciones de los filtros de §75: los restaurantes que quien mira
    // puede ver (RLS) y la gente del equipo. Un cliente no llega aquí; si
    // llegara, `space_memberships` le devuelve cero filas.
    supabase.from("establishments").select("id, name").eq("space_id", space.id).order("name"),
    supabase
      .from("space_memberships")
      .select("user_id, role, status, profiles (full_name, email)")
      .eq("space_id", space.id)
      .eq("status", "active")
      .order("role"),
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
  const espacio = `/espacios/${space.slug}`;
  const base = `${espacio}/calendario`;

  // Los filtros viajan con el mes: cambiar de mes no los pierde.
  const conFiltros = (dia: string): string => {
    const q = new URLSearchParams({ dia });
    if (filtroRestaurante) q.set("restaurante", filtroRestaurante);
    if (filtroTrabajador) q.set("trabajador", filtroTrabajador);
    if (filtroTipo) q.set("tipo", filtroTipo);
    return `${base}?${q.toString()}`;
  };

  const opcionesRestaurante = [
    { value: "", label: es.calendar.filterAny },
    ...(restaurantes ?? []).map((r) => ({ value: r.id, label: r.name })),
  ];
  const opcionesTrabajador = [
    { value: "", label: es.calendar.filterAny },
    ...(miembros ?? []).map((m) => ({ value: m.user_id, label: personName(m.profiles) })),
  ];
  const opcionesTipo = [
    { value: "", label: es.calendar.filterAny },
    ...EVENT_KINDS.map((kind) => ({ value: kind, label: es.calendar.kinds[kind] })),
  ];

  return (
    <div className="space-y-6">
      {/* Página 75 (M15) · título y subtítulo con la zona horaria del
          espacio, que es en la que se calcula todo (CLAUDE.md MUST). */}
      <PageHeader title={es.calendar.title} subtitle={es.calendar.timeZoneHint(space.timezone)} />

      <Card
        title={es.calendar.monthTitle(es.calendar.months[mes - 1], anio)}
        className="space-y-4"
      >
        <nav aria-label={es.calendar.title} className="flex flex-wrap gap-2 text-sm">
          <ButtonLink href={conFiltros(mesAnterior)} variant="secondary" size="sm" icon="arrowLeft">
            {es.calendar.previousMonth}
          </ButtonLink>
          <ButtonLink href={conFiltros(hoy)} variant="secondary" size="sm">
            {es.calendar.today}
          </ButtonLink>
          <ButtonLink href={conFiltros(mesSiguiente)} variant="secondary" size="sm" trailingIcon="arrowRight">
            {es.calendar.nextMonth}
          </ButtonLink>
        </nav>

        {/*
          §75 · los filtros, como formulario GET: la URL resultante es la
          que se comparte y la que funciona sin JavaScript (CA-22).
        */}
        <form method="get" action={base} className="rounded-lg bg-soft-surface p-4">
          <p className="mb-2 text-sm font-semibold text-text">{es.calendar.filtersTitle}</p>
          <input type="hidden" name="dia" value={anclaje} />
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Select
              label={es.calendar.filterEstablishment}
              name="restaurante"
              defaultValue={filtroRestaurante ?? ""}
              options={opcionesRestaurante}
            />
            <Select
              label={es.calendar.filterWorker}
              name="trabajador"
              defaultValue={filtroTrabajador ?? ""}
              options={opcionesTrabajador}
            />
            <Select
              label={es.calendar.filterKind}
              name="tipo"
              defaultValue={filtroTipo ?? ""}
              options={opcionesTipo}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="secondary">
              {es.calendar.filterApply}
            </Button>
            {hayFiltros ? (
              <Link href={`${base}?dia=${anclaje}`} className="text-sm text-cuotly-green underline">
                {es.calendar.filterClear}
              </Link>
            ) : null}
          </div>
        </form>

        {eventosError ? (
          <EmptyState title={es.states.errorTitle} description={es.emptyReasons.error} />
        ) : eventos && eventos.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{es.calendar.dateColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.calendar.kindColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.calendar.detailColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.calendar.stateColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {eventos.map((evento, i) => {
                  const href = eventHref(espacio, evento);
                  const estado = evento.state ? stateOf(evento.kind, evento.state) : null;
                  const detalle = evento.title || es.calendar.noDetail;
                  return (
                    <TableRow key={`${evento.entity_id}-${evento.event_date}-${i}`}>
                      <TableCell>{evento.event_date}</TableCell>
                      <TableCell>{kindLabel(evento.kind)}</TableCell>
                      <TableCell>
                        {href === null ? (
                          detalle
                        ) : (
                          <Link href={href} className="text-cuotly-green underline">
                            {detalle}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        {estado ? <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge> : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title={es.calendar.emptyTitle} description={es.calendar.emptyReason} />
        )}

        {/* §76 · lo que este calendario no enseña, dicho en vez de callado. */}
        <p className="text-xs text-text-secondary">{es.calendar.limitsNote}</p>
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
                    <TableRow>
                      <TableHeaderCell>{es.calendar.pendingRangeColumn}</TableHeaderCell>
                      <TableHeaderCell>{es.calendar.stateColumn}</TableHeaderCell>
                    </TableRow>
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
