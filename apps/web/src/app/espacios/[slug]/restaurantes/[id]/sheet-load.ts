import type { CycleBag, EstablishmentIdentity } from "@/core/establishments";
import { AUDIT_FAMILIES, auditChanges, auditDayWindow, type AuditChange } from "@/core/audit";
import type { AttentionItem } from "@/core/home";
import {
  LIVE_JOB_STATES,
  OPERATION_CARD_ROWS,
  firstRows,
  groupAttentionByEstablishment,
  pickCurrentJob,
  sortOpenTasks,
  type CardRows,
} from "@/core/establishments";
import type { EstablishmentState } from "@/core/naming";
import type { createClient } from "@/lib/supabase/server";

import { loadSpaceAttention } from "../../home-load";
import { loadJobTimers } from "../../trabajos/[id]/timers-load";

/**
 * Lo que enseña la ficha del restaurante (PRD §15.2), leído del servidor.
 *
 * Una función por bloque, y no una sola que lo traiga todo: la ficha son
 * cinco pestañas y solo se pinta una cada vez. Cargar los cobros, los
 * archivos y el historial para enseñar el Resumen serían tres consultas
 * que nadie va a leer, y en la pestaña de Pagos hay además una llamada por
 * cobro para derivar su estado.
 *
 * **Aquí no hay ninguna comprobación de permisos escrita a mano.** Las
 * hacen RLS y las funciones del servidor: `charges` filtra por
 * `can_read_establishment_finance()` (un trabajador solo ve la de sus
 * restaurantes autorizados, RN-FIN-05), `files` por `can_read_file()`
 * (RN-ARC-05: la facturación nunca es visible para los trabajadores) y
 * `establishment_client_users()` comprueba la pertenencia al espacio.
 *
 * `select` enumera columnas SIEMPRE: `requests`, `subscriptions`,
 * `charges`, `files` y `file_versions` tienen privilegios de columna, así
 * que `select *` sobre ellas devuelve 403 (CLAUDE.md).
 */
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Los datos de §15.2, tal como los guarda la migración 57. El tipo vive en
 * `src/core/establishments.ts` y se deriva de `IDENTITY_FIELDS`, la lista
 * que también ordena el formulario y la vista de lectura: así no puede
 * haber un campo guardado que ninguna pantalla enseñe.
 */
export type SheetIdentity = EstablishmentIdentity;

/**
 * Un servicio adicional contratado, con lo que la maqueta 13 enseña de él.
 *
 * **El precio es el del catálogo, y solo ese.** `services` guarda dos
 * —`price_cents` y `price_premium_cents`— porque RN-COM-08 cobra 229 € o
 * 199 € según el establecimiento tenga plan Premium activo, y **cuál de
 * los dos se aplica no lo decide nadie todavía**: la mensualidad de un
 * servicio no se emite (lo dice `create_service_subscription()`, "eso es
 * Menú Diario, Fase 2"). Enseñar aquí 199 € sería afirmar que se le cobra
 * eso, que es justo lo que CLAUDE.md llama dato inventado. La condición se
 * dice con palabras al lado del número, que es lo que sí es verdad.
 */
export interface SheetService {
  readonly subscriptionId: string;
  readonly name: string;
  readonly priceCents: number | null;
  readonly startedAt: string;
}

export interface SheetHeader {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly status: EstablishmentState;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly planPriceCents: number | null;
  /** Los servicios adicionales contratados (RN-COM-13: pueden ser varios). */
  readonly services: readonly SheetService[];
  readonly commitmentEndsAt: string | null;
  /** Desde cuándo corre la permanencia vigente (maqueta 13: "Desde 1 jul 2026"). */
  readonly commitmentStartedAt: string | null;
  readonly cycleStart: string | null;
  readonly cycleEnd: string | null;
  /** §15.2 · la ficha de datos, que se lee en la misma fila. */
  readonly identity: SheetIdentity;
}

export async function loadSheetHeader(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetHeader | null> {
  const { data: establishment } = await supabase
    .from("establishments")
    // §15.2 · las dieciséis columnas de la ficha vienen en esta misma fila, así
    // que se piden aquí y no en una segunda consulta. Enumeradas, como en
    // todo el proyecto: `establishments` no tiene privilegios de columna
    // hoy, pero la costumbre es la que evita que un `select *` se cuele en
    // una tabla que sí los tenga (CLAUDE.md).
    .select(
      "id, name, code, status, group_id, legal_name, tax_id, address, postal_code, city, contact_name, contact_email, phone_primary, phone_secondary, website_url, instagram, facebook_url, domain, opening_hours, web_platform",
    )
    .eq("id", establishmentId)
    .maybeSingle();

  if (!establishment) return null;

  const [{ data: group }, { data: subscriptions }] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", establishment.group_id).maybeSingle(),
    supabase
      .from("subscriptions")
      .select(
        "id, kind, plan_id, started_at, plans (name, price_cents), services (id, name, price_cents)",
      )
      .eq("establishment_id", establishmentId)
      .eq("status", "active"),
  ]);

  const plan = (subscriptions ?? []).find((s) => s.kind === "plan") ?? null;
  const services = (subscriptions ?? [])
    .filter((s) => s.kind === "service" && s.services !== null)
    .map((s) => ({
      subscriptionId: s.id,
      name: s.services!.name,
      priceCents: s.services!.price_cents,
      startedAt: s.started_at,
    }));

  // La permanencia vigente y el ciclo abierto son los del plan, así que sin
  // plan no se preguntan (RN-COM-11: el plan es opcional).
  const [{ data: commitments }, { data: cycles }] = plan
    ? await Promise.all([
        supabase
          .from("plan_commitments")
          .select("subscription_id, started_at, ends_at")
          .eq("subscription_id", plan.id)
          .order("started_at", { ascending: false })
          .limit(1),
        supabase
          .from("consumption_cycles")
          .select("cycle_start, cycle_end")
          .eq("subscription_id", plan.id)
          .order("cycle_start", { ascending: false })
          .limit(1),
      ])
    : [{ data: null }, { data: null }];

  const cycle = cycles?.[0] ?? null;

  return {
    id: establishment.id,
    name: establishment.name,
    code: establishment.code,
    status: establishment.status as EstablishmentState,
    groupId: establishment.group_id,
    groupName: group?.name ?? null,
    planId: plan?.plan_id ?? null,
    planName: plan?.plans?.name ?? null,
    planPriceCents: plan?.plans?.price_cents ?? null,
    services,
    commitmentEndsAt: commitments?.[0]?.ends_at ?? null,
    commitmentStartedAt: commitments?.[0]?.started_at ?? null,
    cycleStart: cycle?.cycle_start ?? null,
    cycleEnd: cycle?.cycle_end ?? null,
    identity: {
      legalName: establishment.legal_name,
      taxId: establishment.tax_id,
      address: establishment.address,
      postalCode: establishment.postal_code,
      city: establishment.city,
      contactName: establishment.contact_name,
      contactEmail: establishment.contact_email,
      phonePrimary: establishment.phone_primary,
      phoneSecondary: establishment.phone_secondary,
      websiteUrl: establishment.website_url,
      instagram: establishment.instagram,
      facebookUrl: establishment.facebook_url,
      domain: establishment.domain,
      openingHours: establishment.opening_hours,
      webPlatform: establishment.web_platform,
    },
  };
}

// ---------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------

/** Una solicitud esperando la validación del equipo (RN-CLS-03). */
export interface SheetPendingRequest {
  readonly id: string;
  readonly description: string;
  readonly createdAt: string;
  readonly deepLink: string;
}

/**
 * El trabajo vivo del restaurante y el plazo que le corre, para la tarjeta
 * "Trabajo actual" de la maqueta 03.
 *
 * `remainingMinutes` sale de recalcular el contador desde `timer_events`
 * (CA-10), no de ningún campo: lo hace `loadJobTimers()`, la misma función
 * que usa el detalle del trabajo, para que las dos pantallas no puedan
 * decir horas distintas del mismo plazo.
 */
export interface SheetCurrentJob {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly state: string;
  readonly deepLink: string;
  /** `"t2"` es el plazo para comenzar y `"t3"` el de ejecución (RN-SLA). */
  readonly counter: "t2" | "t3" | null;
  readonly remainingMinutes: number | null;
  readonly overdue: boolean;
}

/**
 * El estado de pago del restaurante, para la tarjeta de la maqueta 03.
 *
 * `allowed` es `false` cuando quien mira no puede ver la facturación
 * (RN-FIN-05/07: un trabajador solo ve la de sus restaurantes
 * autorizados). Y entonces la tarjeta **no dice "al día"**: decir que no
 * hay deuda sin haber podido mirar es afirmar algo que no se sabe (CA-20).
 */
export interface SheetPaymentStatus {
  readonly allowed: boolean;
  readonly outstandingCents: number;
  /** Cobros vencidos y sin saldar. Es lo que convierte "debe" en "debe ya". */
  readonly overdueCount: number;
}

export interface SheetSummary {
  readonly bags: readonly CycleBag[];
  readonly attention: readonly AttentionItem[];
  readonly pendingValidation: readonly SheetPendingRequest[];
  /** Solicitudes abiertas en total, no solo las que esperan validación. */
  readonly openRequests: number;
  readonly currentJob: SheetCurrentJob | null;
  /**
   * Cuántos trabajos vivos tiene en total. La tarjeta enseña UNO —el más
   * avanzado— y con esto puede decir cuántos quedan detrás: enseñar uno de
   * seis sin avisar es esconder cinco (CA-20).
   */
  readonly liveJobs: number;
  readonly payment: SheetPaymentStatus;
}

/**
 * La deuda viva del restaurante, derivada del libro (RN-FIN-02 +
 * RN-DAT-05): aquí no se suma dinero, se pregunta al servidor cobro a
 * cobro. Un contador de deuda en una columna sería justo lo que CLAUDE.md
 * prohíbe.
 */
async function loadPaymentStatus(
  supabase: Supabase,
  establishmentId: string,
  now: Date,
): Promise<SheetPaymentStatus> {
  const { data: allowed } = await supabase.rpc("can_read_establishment_finance", {
    p_establishment_id: establishmentId,
  });

  if (allowed !== true) return { allowed: false, outstandingCents: 0, overdueCount: 0 };

  const { data: charges } = await supabase
    .from("charges")
    .select("id, due_at")
    .eq("establishment_id", establishmentId);

  const pendientes = await Promise.all(
    (charges ?? []).map(async (charge) => {
      const { data: outstanding } = await supabase.rpc("charge_outstanding_cents", {
        p_charge_id: charge.id,
      });
      return { outstanding: outstanding ?? 0, dueAt: charge.due_at };
    }),
  );

  return {
    allowed: true,
    outstandingCents: pendientes.reduce((total, c) => total + Math.max(0, c.outstanding), 0),
    overdueCount: pendientes.filter((c) => c.outstanding > 0 && new Date(c.dueAt) < now).length,
  };
}

/**
 * El trabajo vivo con su plazo. El contador se recalcula con
 * `loadJobTimers()` —la misma función del detalle del trabajo— para que
 * las dos pantallas no puedan discrepar sobre las horas que quedan.
 */
async function currentJobFrom(
  supabase: Supabase,
  spaceSlug: string,
  establishmentId: string,
  job: {
    readonly id: string;
    readonly code: string;
    readonly space_id: string;
    readonly state: string;
    readonly category: string | null;
    readonly request_id: string | null;
  },
  now: Date,
): Promise<SheetCurrentJob> {
  // El título que se enseña es el de la solicitud que lo originó, como en
  // la maqueta ("Cambiar horario del sábado"): el código del trabajo no le
  // dice nada a nadie de un vistazo. Si no hay solicitud detrás, se queda
  // el código, que es verdad aunque sea seco.
  const { data: request } =
    job.request_id === null
      ? { data: null }
      : await supabase
          .from("requests")
          .select("description")
          .eq("id", job.request_id)
          .maybeSingle();

  const timers = await loadJobTimers(supabase, job, now);
  const status = timers.counter === "t2" ? timers.t2 : timers.counter === "t3" ? timers.t3 : null;

  return {
    id: job.id,
    code: job.code,
    title: request?.description ?? job.code,
    state: job.state,
    deepLink: `/espacios/${spaceSlug}/trabajos/${job.id}`,
    counter: timers.counter,
    remainingMinutes: status?.remainingMinutes ?? null,
    overdue: timers.outOfDeadline,
  };
}

export async function loadSheetSummary(
  supabase: Supabase,
  spaceId: string,
  spaceSlug: string,
  establishmentId: string,
  now: Date = new Date(),
): Promise<SheetSummary> {
  const [{ data: allowance }, attention, { data: requests }, { data: jobs }, payment] =
    await Promise.all([
      supabase.rpc("establishment_cycle_allowance", { p_establishment_id: establishmentId }),
      loadSpaceAttention(supabase, spaceId, spaceSlug, now),
      supabase
        .from("requests")
        .select("id, description, state, created_at")
        .eq("establishment_id", establishmentId)
        .not("state", "in", `(${CLOSED_REQUEST_STATES.join(",")})`)
        .order("created_at", { ascending: false }),
      supabase
        .from("jobs")
        .select("id, code, space_id, state, category, request_id, created_at")
        .eq("establishment_id", establishmentId)
        .in("state", [...LIVE_JOB_STATES])
        .order("created_at", { ascending: false }),
      loadPaymentStatus(supabase, establishmentId, now),
    ]);

  // El trabajo que se enseña es el MÁS AVANZADO de los vivos, no el más
  // reciente. La decisión vive en `src/core/establishments.ts`, con su
  // prueba: aquí solo se le pasan las filas.
  const elegido = pickCurrentJob(jobs ?? []);

  return {
    bags: (allowance ?? []).map((line) => ({
      category: line.category as CycleBag["category"],
      included: line.included,
      remaining: line.remaining,
    })),
    attention: groupAttentionByEstablishment(attention.items).get(establishmentId) ?? [],
    openRequests: (requests ?? []).length,
    pendingValidation: (requests ?? [])
      .filter((request) => request.state === "pending_internal_validation")
      .map((request) => ({
        id: request.id,
        description: request.description,
        createdAt: request.created_at,
        deepLink: `/espacios/${spaceSlug}/solicitudes/${request.id}`,
      })),
    liveJobs: (jobs ?? []).length,
    currentJob:
      elegido === null
        ? null
        : await currentJobFrom(supabase, spaceSlug, establishmentId, elegido, now),
    payment,
  };
}

// ---------------------------------------------------------------------
// Operación (vista 04)
// ---------------------------------------------------------------------

/**
 * Una solicitud del restaurante, con quién la escribió y cuándo.
 *
 * El autor es el dato que la maqueta pone debajo del título ("Marta ·
 * Hoy, 10:24") y no es decorativo: dos solicitudes del mismo día se
 * distinguen por quién las pidió. Cuando no se puede resolver el nombre
 * —RLS no deja ver ese perfil— viaja `null` y la fila enseña solo la
 * fecha, nunca un uuid.
 */
export interface SheetOperationRequest {
  readonly id: string;
  readonly code: string;
  readonly description: string;
  readonly state: string;
  readonly createdAt: string;
  readonly authorName: string | null;
  readonly deepLink: string;
}

/**
 * Una tarea abierta del restaurante (§11.2, HU-21).
 *
 * `deepLink` lleva al trabajo del que cuelga, que es donde se opera con
 * ella: no hay pantalla de detalle de tarea. Una actividad interna
 * independiente (`job_id` nulo, §3) no lleva a ninguna parte, y entonces
 * la fila no es un enlace en vez de ser un enlace roto.
 */
export interface SheetOperationTask {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly weight: string;
  readonly estimatedMinutes: number;
  readonly assigneeName: string | null;
  readonly jobCode: string | null;
  /**
   * El día para el que está planificada (maqueta 07 · columna "Fecha"), o
   * `null` si nadie la ha planificado todavía. Es un `date` sin hora: el
   * día que alguien escribió, no un instante.
   */
  readonly plannedDate: string | null;
  readonly deepLink: string | null;
}

/**
 * Las tres listas de la vista 04, ya cortadas a lo que cabe en su tarjeta
 * y con la cuenta de lo que queda detrás (`firstRows`, `src/core`).
 *
 * Se cortan **aquí** y no al pintar por un motivo que se ve en los
 * trabajos: el plazo de cada uno se recalcula desde sus eventos con
 * `loadJobTimers()`, y traerlo de los quince trabajos vivos para enseñar
 * cuatro serían cuarenta consultas que nadie va a leer.
 */
export interface SheetOperation {
  readonly requests: CardRows<SheetOperationRequest>;
  readonly jobs: CardRows<SheetCurrentJob>;
  readonly tasks: CardRows<SheetOperationTask>;
}

/** Los estados que ya no están vivos: una solicitud cerrada no es "abierta". */
const CLOSED_REQUEST_STATES = ["closed", "rejected", "cancelled_before_start", "cancelled_after_start"];
const CLOSED_JOB_STATES = ["completed", "cancelled_before_start", "cancelled_after_start"];

/**
 * Los nombres de quienes aparecen en la Operación: autores de solicitudes
 * y responsables de tareas.
 *
 * Hacen falta **dos** fuentes y no una, y es la misma asimetría que la
 * pestaña Usuarios: `profiles_select` deja ver a quien comparte espacio
 * —el equipo—, pero un cliente no es miembro del espacio, así que su
 * nombre solo llega por `establishment_client_users()`, que comprueba el
 * permiso por su cuenta. Sin la segunda consulta, "Marta · Hoy, 10:24"
 * sería un hueco justo en las solicitudes que escribe el restaurante.
 *
 * Lo que no se resuelve **no se rellena con el uuid**: un identificador en
 * la pantalla no le dice a nadie quién pidió el cambio (CA-20).
 */
async function loadPeopleNames(
  supabase: Supabase,
  establishmentId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const buscados = [...new Set(ids)];
  if (buscados.length === 0) return new Map();

  const [{ data: profiles }, { data: clientUsers }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", buscados),
    supabase.rpc("establishment_client_users", { p_establishment_id: establishmentId }),
  ]);

  const nombres = new Map<string, string>();
  for (const person of profiles ?? []) {
    const nombre = person.full_name?.trim() || person.email;
    if (nombre) nombres.set(person.id, nombre);
  }
  for (const person of clientUsers ?? []) {
    if (!buscados.includes(person.user_id)) continue;
    const nombre = person.display_name?.trim() || person.email;
    if (nombre) nombres.set(person.user_id, nombre);
  }
  return nombres;
}

export async function loadSheetOperation(
  supabase: Supabase,
  spaceSlug: string,
  establishmentId: string,
  now: Date = new Date(),
): Promise<SheetOperation> {
  // Las tres consultas ordenan por fecha y **desempatan por `id`**. El
  // desempate no es adorno: `created_at` vale `now()`, que en PostgreSQL es
  // la hora de la TRANSACCIÓN, así que todo lo que se crea de una vez
  // —las seis tareas del reportaje sembradas en un mismo bloque, o dos
  // solicitudes enviadas en la misma llamada— comparte fecha al segundo.
  // Sin desempate, esas filas empatadas salen en el orden físico de la
  // tabla y la tarjeta puede enseñar unas u otras entre dos recargas, con
  // "y 1 más" escondiendo cada vez una distinta.
  const [{ data: requests }, { data: jobs }, { data: tasks }] = await Promise.all([
    supabase
      .from("requests")
      .select("id, code, description, state, created_by, created_at")
      .eq("establishment_id", establishmentId)
      .not("state", "in", `(${CLOSED_REQUEST_STATES.join(",")})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, code, space_id, state, category, request_id, created_at")
      .eq("establishment_id", establishmentId)
      .not("state", "in", `(${CLOSED_JOB_STATES.join(",")})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    // Las tareas las filtra `tasks_select`: quien tiene 'assign_jobs' ve
    // las del espacio y un trabajador solo las suyas y las de sus trabajos
    // autorizados (§4.3). Aquí no se comprueba nada de eso, y por eso la
    // tarjeta vacía dice "las que te dejan ver" y no "no hay ninguna".
    supabase
      .from("tasks")
      .select(
        "id, title, state, weight, estimated_minutes, assignee_id, job_id, planned_date, created_at",
      )
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  // El orden de las tareas lo decide `sortOpenTasks()` (src/core), no la
  // consulta: lo avanzado va antes que lo que espera, y lo terminado no
  // entra en la tarjeta.
  const abiertas = sortOpenTasks(tasks ?? []);

  const filasSolicitudes = firstRows(requests ?? [], OPERATION_CARD_ROWS);
  const filasTrabajos = firstRows(jobs ?? [], OPERATION_CARD_ROWS);
  const filasTareas = firstRows(abiertas, OPERATION_CARD_ROWS);

  const jobIds = filasTareas.shown.map((task) => task.job_id).filter((id): id is string => id !== null);
  const [nombres, { data: jobCodes }] = await Promise.all([
    loadPeopleNames(supabase, establishmentId, [
      ...filasSolicitudes.shown.map((request) => request.created_by),
      ...filasTareas.shown.map((task) => task.assignee_id).filter((id): id is string => id !== null),
    ]),
    jobIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; code: string }[] })
      : supabase.from("jobs").select("id, code").in("id", jobIds),
  ]);

  const codigoDelTrabajo = new Map((jobCodes ?? []).map((job) => [job.id, job.code]));

  return {
    requests: {
      hidden: filasSolicitudes.hidden,
      shown: filasSolicitudes.shown.map((request) => ({
        id: request.id,
        code: request.code,
        description: request.description,
        state: request.state,
        createdAt: request.created_at,
        authorName: nombres.get(request.created_by) ?? null,
        deepLink: `/espacios/${spaceSlug}/solicitudes/${request.id}`,
      })),
    },
    // El plazo de cada trabajo sale de `currentJobFrom()`, la misma función
    // que usa el Resumen: dos pantallas de la misma ficha no pueden decir
    // horas distintas del mismo contador (CA-10).
    jobs: {
      hidden: filasTrabajos.hidden,
      shown: await Promise.all(
        filasTrabajos.shown.map((job) =>
          currentJobFrom(supabase, spaceSlug, establishmentId, job, now),
        ),
      ),
    },
    tasks: {
      hidden: filasTareas.hidden,
      shown: filasTareas.shown.map((task) => ({
        id: task.id,
        title: task.title,
        state: task.state,
        weight: task.weight,
        estimatedMinutes: task.estimated_minutes,
        assigneeName: task.assignee_id === null ? null : (nombres.get(task.assignee_id) ?? null),
        jobCode: task.job_id === null ? null : (codigoDelTrabajo.get(task.job_id) ?? null),
        plannedDate: task.planned_date,
        // A la tarea, no al trabajo. Cuando se escribió esta tarjeta no
        // había pantalla de detalle de tarea y la fila llevaba al trabajo
        // entero, que era lo más cerca que se podía llegar; ahora la hay
        // (maqueta 07) y la tarea elegida viaja en la dirección, así que
        // la fila abre directamente la que se ha pulsado.
        //
        // Una actividad interna independiente (§3) sigue sin cuelgue: no
        // cuelga de ningún trabajo, no hay pantalla donde abrirla, y por
        // eso no se pinta como enlace en vez de ser un enlace que no lleva
        // a ninguna parte.
        deepLink:
          task.job_id === null
            ? null
            : `/espacios/${spaceSlug}/trabajos/${task.job_id}/tareas?tarea=${task.id}`,
      })),
    },
  };
}

// ---------------------------------------------------------------------
// Informes y datos · Fase 1: "indicadores operativos propios" (§15.2)
// ---------------------------------------------------------------------

/**
 * Recuentos, no métricas. Cada número de aquí es "cuántas filas hay de
 * esto", contadas sobre lo que RLS deja ver. No hay ninguna media, ningún
 * objetivo, ninguna tendencia y ningún umbral: eso sería inventarse los
 * indicadores que la Fase 3 todavía no ha definido (CLAUDE.md).
 */
export interface SheetCounts {
  readonly requestsByState: readonly (readonly [string, number])[];
  readonly jobsByState: readonly (readonly [string, number])[];
  readonly files: number;
}

function countByState(rows: readonly { readonly state: string }[]): readonly (readonly [string, number])[] {
  const cuenta = new Map<string, number>();
  for (const row of rows) cuenta.set(row.state, (cuenta.get(row.state) ?? 0) + 1);
  // Orden determinista: el mismo recuento no puede salir en dos órdenes
  // distintos entre dos recargas.
  return [...cuenta.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
}

export async function loadSheetCounts(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetCounts> {
  const [{ data: requests }, { data: jobs }, { count: files }] = await Promise.all([
    supabase.from("requests").select("state").eq("establishment_id", establishmentId),
    supabase.from("jobs").select("state").eq("establishment_id", establishmentId),
    supabase
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", establishmentId),
  ]);

  return {
    requestsByState: countByState(requests ?? []),
    jobsByState: countByState(jobs ?? []),
    files: files ?? 0,
  };
}

// ---------------------------------------------------------------------
// Gestión · Pagos
// ---------------------------------------------------------------------

export interface SheetCharge {
  readonly id: string;
  readonly concept: string;
  /**
   * RN-FIN-08 · los tres importes se guardan al emitir, con el tipo que
   * regía ese día. La pantalla **no los calcula**: un 21 % escrito en el
   * cliente reescribiría lo que se facturó el año pasado en cuanto
   * cambiara el tipo (P4), y además sería inventarse una regla fiscal, que
   * es justo el bloque que CLAUDE.md deja aplazado.
   */
  readonly baseCents: number;
  readonly taxRatePercent: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dueAt: string;
  readonly status: string;
  readonly outstandingCents: number;
}

/**
 * Un pago registrado, para el historial de la maqueta 14.
 *
 * **Sin `recorded_by`.** `payments` tiene el `select` revocado y concedido
 * columna a columna para que el cliente no vea quién del equipo registró
 * el cobro (CLAUDE.md), y pedir esa columna devolvería 403. Quién lo hizo
 * sale de `audit_log`, no de aquí.
 */
export interface SheetPayment {
  readonly id: string;
  readonly chargeId: string;
  readonly chargeConcept: string;
  readonly amountCents: number;
  readonly method: string;
  readonly paidAt: string;
  readonly receiptFileId: string | null;
  /** RN-FIN-04: un pago mal registrado no se borra, se revierte y se marca. */
  readonly reversedAt: string | null;
}

export interface SheetPayments {
  /** `false` cuando quien mira no puede ver la facturación (RN-FIN-07). */
  readonly allowed: boolean;
  readonly charges: readonly SheetCharge[];
  readonly payments: readonly SheetPayment[];
}

export async function loadSheetPayments(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetPayments> {
  const { data: allowed } = await supabase.rpc("can_read_establishment_finance", {
    p_establishment_id: establishmentId,
  });

  if (allowed !== true) return { allowed: false, charges: [], payments: [] };

  const { data: charges } = await supabase
    .from("charges")
    .select(
      "id, concept, base_cents, tax_rate_percent, tax_cents, total_cents, period_start, period_end, due_at",
    )
    .eq("establishment_id", establishmentId)
    .order("due_at", { ascending: false });

  // El estado y la deuda viva los deriva el servidor de los apuntes
  // (RN-FIN-02 + RN-DAT-05): aquí no se suma dinero.
  const rows = await Promise.all(
    (charges ?? []).map(async (charge) => {
      const [{ data: status }, { data: outstanding }] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: charge.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id }),
      ]);
      return {
        id: charge.id,
        concept: charge.concept,
        baseCents: charge.base_cents,
        taxRatePercent: Number(charge.tax_rate_percent),
        taxCents: charge.tax_cents,
        totalCents: charge.total_cents,
        periodStart: charge.period_start,
        periodEnd: charge.period_end,
        dueAt: charge.due_at,
        status: status ?? "pending",
        outstandingCents: outstanding ?? 0,
      };
    }),
  );

  // El historial de pagos (maqueta 14). Va después de los cobros porque
  // cada pago se nombra por el concepto del suyo: un "724,79 € · 1 ago"
  // suelto no dice de qué cuota es.
  const { data: payments } = await supabase
    .from("payments")
    .select("id, charge_id, amount_cents, method, paid_at, receipt_file_id, reversed_at")
    .eq("establishment_id", establishmentId)
    .order("paid_at", { ascending: false });

  const conceptoDelCobro = new Map(rows.map((charge) => [charge.id, charge.concept]));

  return {
    allowed: true,
    charges: rows,
    payments: (payments ?? []).map((payment) => ({
      id: payment.id,
      chargeId: payment.charge_id,
      chargeConcept: conceptoDelCobro.get(payment.charge_id) ?? "—",
      amountCents: payment.amount_cents,
      method: payment.method,
      paidAt: payment.paid_at,
      receiptFileId: payment.receipt_file_id,
      reversedAt: payment.reversed_at,
    })),
  };
}

// ---------------------------------------------------------------------
// Gestión · Usuarios
// ---------------------------------------------------------------------

export interface SheetUser {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
  readonly source: "group" | "establishment";
  readonly role: string;
  readonly canEditData: boolean;
  readonly canViewBilling: boolean;
  readonly grantedAt: string;
}

export interface SheetUsers {
  readonly rows: readonly SheetUser[];
  /**
   * `true` cuando la consulta falló. §20.7 pide distinguirlo de "no hay
   * nadie": una lista vacía por un error afirmaría que este restaurante no
   * tiene usuarios, y eso, sin haber podido mirar, no lo sabe nadie.
   */
  readonly failed: boolean;
}

export async function loadSheetUsers(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetUsers> {
  const { data, error } = await supabase.rpc("establishment_client_users", {
    p_establishment_id: establishmentId,
  });

  if (error !== null) return { rows: [], failed: true };

  return {
    failed: false,
    rows: (data ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      source: row.source === "group" ? "group" : "establishment",
      role: row.role,
      canEditData: row.edit_establishment_data,
      canViewBilling: row.view_billing,
      grantedAt: row.granted_at,
    })),
  };
}

/**
 * Maqueta 15 · "Personal operativo asignado": qué gente del equipo está
 * autorizada a trabajar en este restaurante, con su especialidad.
 *
 * **Esto es organización interna y no sale nunca hacia el cliente.** No
 * hace falta ninguna comprobación aquí: la ficha con sus cinco pestañas
 * solo se pinta para quien es miembro del espacio (la pantalla se ramifica
 * por la membresía real), y además `worker_establishments` y `profiles`
 * los filtra RLS — un cliente no comparte espacio con el equipo, así que
 * `profiles_select` no le devuelve ni una fila (P7).
 *
 * **Sin teléfono.** La maqueta enseña una columna de teléfonos y `profiles`
 * no tiene esa columna: no la ha tenido nunca, en ninguna migración.
 * Inventarse un número sería el dato de relleno que CLAUDE.md prohíbe, y
 * añadir la columna es otra tarea — con su migración y su decisión sobre
 * quién puede verlo.
 */
export interface SheetStaffMember {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
  /** §4.6 · las siete especialidades, o vacío si no tiene ninguna declarada. */
  readonly specialties: readonly string[];
  /** El estado de su membresía en el espacio (`active`, `suspended`...). */
  readonly membershipStatus: string | null;
  readonly assignedAt: string;
}

export async function loadSheetStaff(
  supabase: Supabase,
  spaceId: string,
  establishmentId: string,
): Promise<readonly SheetStaffMember[]> {
  const { data: asignaciones } = await supabase
    .from("worker_establishments")
    .select("user_id, created_at")
    .eq("establishment_id", establishmentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });

  const ids = (asignaciones ?? []).map((fila) => fila.user_id);
  if (ids.length === 0) return [];

  const [{ data: perfiles }, { data: especialidades }, { data: membresias }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", ids),
    supabase
      .from("worker_specialties")
      .select("user_id, specialty")
      .eq("space_id", spaceId)
      .in("user_id", ids)
      .is("revoked_at", null),
    supabase
      .from("space_memberships")
      .select("user_id, status")
      .eq("space_id", spaceId)
      .in("user_id", ids),
  ]);

  const perfil = new Map((perfiles ?? []).map((p) => [p.id, p]));
  const estado = new Map((membresias ?? []).map((m) => [m.user_id, m.status]));
  const porTrabajador = new Map<string, string[]>();
  for (const fila of especialidades ?? []) {
    porTrabajador.set(fila.user_id, [...(porTrabajador.get(fila.user_id) ?? []), fila.specialty]);
  }

  // Quien no tenga perfil legible NO se inventa: se cae de la lista. Una
  // fila con un uuid por nombre no le dice a nadie quién es (CA-20).
  return (asignaciones ?? []).flatMap((fila) => {
    const datos = perfil.get(fila.user_id);
    if (datos === undefined) return [];
    return [
      {
        userId: fila.user_id,
        displayName: datos.full_name?.trim() || null,
        email: datos.email,
        specialties: porTrabajador.get(fila.user_id) ?? [],
        membershipStatus: estado.get(fila.user_id) ?? null,
        assignedAt: fila.created_at,
      },
    ];
  });
}

// ---------------------------------------------------------------------
// Gestión · Archivos (RN-ARC-01 a RN-ARC-04)
// ---------------------------------------------------------------------

export interface SheetFileVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly variant: string | null;
  readonly createdAt: string;
  /**
   * Para saber si de esta versión se puede enseñar una miniatura. Se pide
   * el tipo real guardado al registrar el archivo, no se adivina por la
   * extensión del nombre: un `.jpg` que en realidad es un PDF no se pinta.
   */
  readonly mimeType: string;
}

export interface SheetFile {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly visibility: string;
  readonly archivedAt: string | null;
  readonly lastVersion: number;
  /**
   * Tipo y tamaño de la versión VIGENTE (maqueta 16, columnas "Tipo" y
   * "Tamaño"). Son de la versión y no del archivo: RN-ARC-03 dice que
   * sustituir crea una versión nueva, así que el tamaño del archivo es el
   * de la última — la de hace tres versiones pesaba otra cosa.
   *
   * `null` cuando el archivo no tiene ninguna versión registrada, que no
   * debería pasar y aun así no se rellena con un cero: un "0 MB" se lee
   * como un archivo vacío, no como "no consta".
   */
  readonly sizeBytes: number | null;
  readonly mimeType: string | null;
  readonly createdAt: string;
}

/** Una carpeta del panel izquierdo de la maqueta 16, con lo que tiene dentro. */
export interface SheetFileFolder {
  readonly category: string;
  readonly count: number;
}

export interface SheetFiles {
  readonly files: readonly SheetFile[];
  /** Las versiones del archivo elegido en la dirección (`?archivo=`). */
  readonly selected: { readonly file: SheetFile; readonly versions: readonly SheetFileVersion[] } | null;
  /**
   * Las categorías que este restaurante TIENE, para el desplegable de
   * "Categoría". No las ocho de RN-ARC-01: ofrecer un filtro que devuelve
   * cero filas se lee como un error de la pantalla, no como un filtro bien
   * aplicado (el mismo criterio que los filtros del listado, §20.2).
   *
   * Se calculan sobre el catálogo entero, antes de filtrar: si salieran de
   * las filas ya filtradas, elegir "Menús" dejaría el desplegable con
   * "Menús" como única opción y no habría forma de volver.
   */
  readonly categories: readonly string[];
  /**
   * Maqueta 16 · las carpetas con su recuento. Se cuentan sobre el
   * catálogo ENTERO y no sobre lo filtrado: si se contaran después de
   * filtrar, elegir "Menús" dejaría todas las demás carpetas a cero y
   * parecería que los archivos han desaparecido.
   */
  readonly folders: readonly SheetFileFolder[];
  readonly total: number;
  /** La categoría por la que se está filtrando, o `null` si no hay filtro. */
  readonly category: string | null;
}

export async function loadSheetFiles(
  supabase: Supabase,
  establishmentId: string,
  selectedFileId: string | undefined,
  category: string | undefined,
): Promise<SheetFiles> {
  // Ni `files.created_by` ni `file_versions.created_by` están concedidas
  // (migraciones 26 y 28): quien subió el archivo es identidad del equipo y
  // no sale de una tabla. Pedirlas devolvería 403.
  const { data: files } = await supabase
    .from("files")
    .select("id, name, category, visibility, archived_at, created_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  const ids = (files ?? []).map((file) => file.id);

  // RN-ARC-03 · sustituir un archivo crea una versión nueva y la anterior
  // permanece. La columna "Versión" enseña la última, que es la vigente.
  const { data: versions } = ids.length
    ? await supabase
        .from("file_versions")
        .select("id, file_id, version_number, file_name, size_bytes, variant, mime_type, created_at")
        .in("file_id", ids)
        .order("version_number", { ascending: false })
    : { data: [] };

  const porArchivo = new Map<string, SheetFileVersion[]>();
  for (const version of versions ?? []) {
    const suyas = porArchivo.get(version.file_id) ?? [];
    suyas.push({
      id: version.id,
      versionNumber: version.version_number,
      fileName: version.file_name,
      sizeBytes: version.size_bytes,
      variant: version.variant,
      createdAt: version.created_at,
      mimeType: version.mime_type,
    });
    porArchivo.set(version.file_id, suyas);
  }

  const rows: SheetFile[] = (files ?? []).map((file) => {
    // Las versiones vienen ordenadas de mayor a menor, así que la primera
    // es la vigente.
    const vigente = porArchivo.get(file.id)?.[0] ?? null;
    return {
      id: file.id,
      name: file.name,
      category: file.category,
      visibility: file.visibility,
      archivedAt: file.archived_at,
      lastVersion: vigente?.versionNumber ?? 1,
      sizeBytes: vigente?.sizeBytes ?? null,
      mimeType: vigente?.mimeType ?? null,
      createdAt: file.created_at,
    };
  });

  const categories = [...new Set(rows.map((file) => file.category))].sort();

  // Una categoría que no existe en este restaurante no filtra: se ignora y
  // se enseña el catálogo entero. Filtrar por ella dejaría la tabla vacía
  // y parecería que no hay archivos (CA-20).
  const filtro = category !== undefined && categories.includes(category) ? category : null;
  const visibles = filtro === null ? rows : rows.filter((file) => file.category === filtro);

  // El archivo elegido se busca sobre el catálogo entero, no sobre lo
  // filtrado: el enlace de "los archivos de Magariños con este abierto"
  // debe seguir abriéndolo aunque el filtro lo esconda de la tabla.
  const elegido = rows.find((file) => file.id === selectedFileId) ?? null;

  const carpetas = categories.map((category) => ({
    category,
    count: rows.filter((file) => file.category === category).length,
  }));

  return {
    files: visibles,
    categories,
    folders: carpetas,
    total: rows.length,
    category: filtro,
    selected:
      elegido === null
        ? null
        : { file: elegido, versions: porArchivo.get(elegido.id) ?? [] },
  };
}

// ---------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------
//
// La lista de cambios de estado que vivía aquí (`loadSheetHistory`, sobre
// `state_events`) se ha ido con la maqueta 19: la pestaña lee ahora la
// auditoría acotada al restaurante, que dice lo mismo y además quién lo
// hizo. Dejarla habría sido un segundo historial que un día cuenta otra
// cosa — y un cargador que no llama nadie.

export interface SheetAuditRow {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  /**
   * Quién lo hizo, o `null` cuando **no lo hizo nadie**: los barridos y
   * las emisiones automáticas escriben su apunte sin actor, y la pantalla
   * dice "Sistema", que es la verdad.
   *
   * Ojo con la diferencia, que costó un rato ver con datos reales: "no hay
   * actor" y "hay actor y no sé su nombre" NO son lo mismo. Un cambio que
   * hizo el restaurante salía como "Sistema" porque `profiles_select` no
   * le deja al equipo leer el perfil de un cliente —no comparten espacio—,
   * y decir que lo hizo el sistema cuando lo hizo una persona es mentir en
   * la pantalla que existe justo para saber quién hizo qué.
   */
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly changes: readonly AuditChange[];
  readonly reason: string | null;
}

export interface SheetAuditActor {
  readonly id: string;
  readonly name: string;
}

export interface SheetAuditFilters {
  readonly from: string | null;
  readonly to: string | null;
  readonly family: string | null;
  readonly actorId: string | null;
  readonly page: number;
}

export interface SheetAudit {
  readonly rows: readonly SheetAuditRow[];
  readonly actors: readonly SheetAuditActor[];
  readonly filters: SheetAuditFilters;
  readonly hasMore: boolean;
}

export const AUDIT_PAGE_SIZE = 25;

/**
 * Maqueta 19 · "todas las acciones realizadas en el restaurante".
 *
 * **Aquí no se filtra por permisos, y es lo importante.** Las filas las
 * decide la política de `audit_log` (§21.2): el propietario ve su espacio
 * entero, un administrador la operativa, un trabajador sus propias
 * acciones y las filas que ya puede ver, y un cliente no llega. Por eso
 * `establishment_audit()` es SECURITY INVOKER — si fuera DEFINER, esta
 * pantalla sería una puerta de atrás a la auditoría del espacio.
 *
 * El filtro de fechas viaja como día natural y se convierte a instantes en
 * la zona del ESPACIO (`auditDayWindow`), no en la del navegador: "del 1 al
 * 15 de septiembre" significa lo mismo para todo el equipo.
 */
export async function loadSheetAudit(
  supabase: Supabase,
  establishmentId: string,
  timeZone: string,
  filters: SheetAuditFilters,
): Promise<SheetAudit> {
  const ventana = auditDayWindow(filters.from, filters.to, timeZone);
  const familia =
    filters.family !== null && AUDIT_FAMILIES.includes(filters.family) ? filters.family : null;
  const pagina = Number.isInteger(filters.page) && filters.page > 0 ? filters.page : 1;

  // Se pide una fila de más: así se sabe si hay página siguiente sin
  // contar la tabla entera, que crece para siempre (§20.7).
  const [{ data: filas }, { data: actores }] = await Promise.all([
    supabase.rpc("establishment_audit", {
      p_establishment_id: establishmentId,
      p_from: ventana.from ?? undefined,
      p_to: ventana.to ?? undefined,
      p_family: familia ?? undefined,
      p_actor_id: filters.actorId ?? undefined,
      p_limit: AUDIT_PAGE_SIZE + 1,
      p_offset: (pagina - 1) * AUDIT_PAGE_SIZE,
    }),
    supabase.rpc("establishment_audit_actors", { p_establishment_id: establishmentId }),
  ]);

  const traidas = filas ?? [];
  const visibles = traidas.slice(0, AUDIT_PAGE_SIZE);

  const ids = [
    ...new Set([
      ...visibles.map((fila) => fila.actor_id),
      ...(actores ?? []).map((fila) => fila.actor_id),
    ]),
  ].filter((id): id is string => id !== null);

  // Dos fuentes, la misma asimetría que en la Operación: `profiles_select`
  // deja ver a quien comparte espacio —el equipo—, pero un cliente no es
  // miembro del espacio y su nombre solo llega por
  // `establishment_client_users()`, que comprueba el permiso por su cuenta.
  // Sin la segunda, cada cosa que hace el restaurante saldría sin nombre.
  const nombre = await loadPeopleNames(supabase, establishmentId, ids);

  return {
    rows: visibles.map((fila) => ({
      id: fila.id,
      createdAt: fila.created_at,
      action: fila.action,
      entityType: fila.entity_type,
      entityId: fila.entity_id,
      actorId: fila.actor_id,
      actorName: fila.actor_id === null ? null : (nombre.get(fila.actor_id) ?? null),
      changes: auditChanges(fila.old_value, fila.new_value),
      reason: fila.reason,
    })),
    // Quien no tenga nombre legible no entra en el desplegable: un uuid no
    // le dice a nadie por quién está filtrando (CA-20).
    actors: (actores ?? [])
      .flatMap((fila) =>
        fila.actor_id === null || !nombre.has(fila.actor_id)
          ? []
          : [{ id: fila.actor_id, name: nombre.get(fila.actor_id)! }],
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    filters: { ...filters, family: familia, page: pagina },
    hasMore: traidas.length > AUDIT_PAGE_SIZE,
  };
}
