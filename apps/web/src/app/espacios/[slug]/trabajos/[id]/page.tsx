import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";

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
import { Icon, type IconName } from "@/components/ui/Icon";
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { tiempoRestante } from "@/i18n/duration";
import { createClient } from "@/lib/supabase/server";
import { loadTeamJobs } from "../list-query";
import { listPosition } from "@/core/requests";
import { jobEnd } from "@/core/job-execution";
import { JobEvidence, type EvidenceFile } from "./JobEvidence";
import type { JobState } from "@/core/job-states";

import { jobTone } from "../page";
import { loadJobTimers } from "./timers-load";
import {
  AssignJobForm,
  BlockJobForm,
  OpenInternalConversationForm,
  PublishJobForm,
  StartJobForm,
  UnblockJobForm,
  type Candidate,
} from "./JobActions";
import { TaskBreakdown, type TaskCandidate, type TaskRow } from "./TaskBreakdown";

/**
 * Detalle de un trabajo para el equipo (HU-17 a HU-20).
 *
 * Qué acciones se ofrecen depende del estado, pero eso es presentación: si
 * alguien llamara a `start_job()` sobre un trabajo sin asignar, la función
 * lanza. Aquí no se autoriza nada (CLAUDE.md MUST).
 *
 * Los candidatos y su orden salen de `list_job_candidates()`, que aplica
 * el orden determinista del PRD. No se reordena ni se pondera nada aquí:
 * CLAUDE.md prohíbe inventar la fórmula ponderada.
 */
export const dynamic = "force-dynamic";

type JobStateKey = keyof typeof es.naming.states.job;
type CategoryKey = keyof typeof es.naming.categories;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Una línea de contador: su nombre, lo que dice y por qué. Cuando el
 * contador no ha arrancado se dice ESO, no "quedan 0 h", que sería
 * afirmar un plazo agotado cuando lo que pasa es que no ha empezado
 * (CA-20).
 */
function Contador({
  titulo,
  valor,
  pista,
  tono,
}: {
  titulo: string;
  valor: string;
  pista: string;
  tono: "normal" | "hecho" | "alerta";
}) {
  const color =
    tono === "alerta" ? "text-danger" : tono === "hecho" ? "text-cuotly-green" : "text-primary-dark";

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="text-xs text-text-secondary">{titulo}</p>
      <p className={`text-sm font-semibold ${color}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{pista}</p>
    </div>
  );
}

/**
 * Los cuatro desenlaces de `jobEnd()` que NO dan fecha, con su texto y su
 * motivo. Se escriben aquí y no en la plantilla para que se vea de un
 * golpe que los cuatro están cubiertos: un `switch` repartido por el JSX
 * es como se pierde uno y queda un hueco en blanco.
 */
const FIN_SIN_FECHA = {
  paused: { texto: es.teamArea.jobs.endPaused, motivo: es.teamArea.jobs.endPausedHint },
  not_started: {
    texto: es.teamArea.jobs.endNotStarted,
    motivo: es.teamArea.jobs.endNotStartedHint,
  },
  cancelled: { texto: es.teamArea.jobs.endCancelled, motivo: es.teamArea.jobs.endCancelledHint },
  no_deadline: { texto: es.teamArea.jobs.endUnknown, motivo: es.teamArea.jobs.endUnknownHint },
} as const;

/** "11 sept 2026, 09:00", como en la maqueta 06. */
function fechaYHora(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Una flecha del paginador. Deshabilitada en los extremos y NO oculta: un
 * control que desaparece mueve los de al lado y se acaba pulsando el que
 * no era.
 */
function JobPagerLink({
  href,
  icon,
  label,
}: {
  href: string | null;
  icon: IconName;
  label: string;
}) {
  const clases =
    "flex h-9 w-9 items-center justify-center rounded-[10px] border border-border transition-colors";

  if (href === null) {
    return (
      <span aria-hidden="true" className={`${clases} cursor-not-allowed text-border`}>
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`${clases} text-text-secondary hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green`}
    >
      <Icon name={icon} aria-hidden="true" className="h-[18px] w-[18px]" />
    </Link>
  );
}

export default async function TeamJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  // `?restaurante=` dice de qué lista se viene, que es lo que hace posible
  // el paginador de la maqueta 06.
  searchParams: Promise<{ restaurante?: string }>;
}) {
  const { slug, id } = await params;
  const { restaurante } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, space_id, code, state, category, assigned_to, establishment_id, request_id, started_at, published_at, correction_window_ends_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: establishment }, { data: request }, { data: space }, { data: charges }] =
    await Promise.all([
      supabase
        .from("establishments")
        .select("id, name")
        .eq("id", job.establishment_id)
        .maybeSingle(),
      supabase
        .from("requests")
        .select("id, code, description")
        .eq("id", job.request_id)
        .maybeSingle(),
      supabase.from("spaces").select("timezone").eq("id", job.space_id).maybeSingle(),
      // HU-27 · los cobros del restaurante de ESTE trabajo, nunca los del
      // espacio: RN-FIN-05 le niega al trabajador los ingresos globales.
      // Quién ve estas filas lo decide `charges_select`
      // (`can_read_establishment_finance`), no esta pantalla: a un
      // trabajador sin ese restaurante autorizado la base de datos le
      // devuelve cero filas (CLAUDE.md MUST).
      supabase
        .from("charges")
        .select("id, concept, total_cents, due_at")
        .eq("establishment_id", job.establishment_id)
        .order("due_at", { ascending: true }),
    ]);

  // La deuda viva y el estado los deriva el servidor del libro de apuntes
  // (RN-FIN-02 + RN-DAT-05): aquí no se suman importes. Solo se piden para
  // las filas que RLS ya ha dejado pasar, así que la función nunca se
  // encuentra con alguien sin visibilidad financiera.
  const outstandingCharges = (
    await Promise.all(
      (charges ?? []).map(async (charge) => {
        const { data: outstanding } = await supabase.rpc("charge_outstanding_cents", {
          p_charge_id: charge.id,
        });
        return { ...charge, outstanding: outstanding ?? 0 };
      }),
    )
  ).filter((charge) => charge.outstanding > 0);

  // Los candidatos solo se piden cuando hacen falta: la función exige
  // permiso de asignación y lanza a quien no lo tenga.
  let candidates: Candidate[] = [];
  if (job.state === "pending_assignment") {
    const { data: rows } = await supabase.rpc("list_job_candidates", { p_job_id: id });
    const ids = (rows ?? []).map((r) => r.worker_id);
    const { data: people } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const name = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));
    candidates = (rows ?? []).map((r) => ({
      workerId: r.worker_id,
      name: name.get(r.worker_id) ?? r.worker_id,
      loadPoints: r.active_load_points,
      jobCount: r.active_job_count,
    }));
  }

  // HU-21 · el desglose de este trabajo. Las filas las filtra
  // `tasks_select`: un trabajador ve las de sus trabajos autorizados y las
  // suyas, el cliente no ve ninguna (P7, las tareas son organización
  // interna). Aquí no se comprueba nada de eso.
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("id, title, description, state, weight, estimated_minutes, assignee_id")
    .eq("job_id", id)
    .order("created_at", { ascending: true });

  // Quién puede desglosar y repartir es lo mismo que comprueban
  // `create_job_task()` y `assign_task()`: el responsable del trabajo, o
  // quien tiene `assign_jobs`. Se pregunta para no pintar un formulario
  // que el servidor va a rechazar; lo que lo impide de verdad es él.
  const { data: puedeAsignar } = await supabase.rpc("has_capability", {
    p_space_id: job.space_id,
    p_capability: "assign_jobs",
  });
  const esResponsable = job.assigned_to === user.id;
  const puedeDesglosar = Boolean(puedeAsignar) || esResponsable;

  // §66.2 y P7 · la conversación interna solo se le ofrece a quien es del
  // espacio. El restaurante puede abrir la ficha de su trabajo por URL
  // (`can_read_job()` le deja a propósito, ve el estado del suyo), y
  // enseñarle un botón de coordinación interna sería contarle que existe
  // una organización interna que no le corresponde ver. Quien lo impide de
  // verdad es `get_or_create_job_conversation()`, que exige ser del
  // espacio; esto solo evita ofrecerle una puerta que no es suya.
  const { data: esDelEquipo } = await supabase.rpc("is_space_member", {
    p_space_id: job.space_id,
  });

  // Los candidatos de una tarea no son los del trabajo: `list_job_candidates()`
  // filtra por la especialidad y la elegibilidad completa de RN-ASG-02, y
  // una tarea es un paso interno que puede recaer en alguien que no sería
  // candidato a llevarse el trabajo entero.
  let taskCandidates: TaskCandidate[] = [];
  if (puedeDesglosar) {
    const { data: filas } = await supabase.rpc("list_task_candidates", {
      p_job_id: id,
    });
    const ids = (filas ?? []).map((f) => f.worker_id);
    const { data: personas } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const nombre = new Map((personas ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));
    taskCandidates = (filas ?? []).map((f) => ({
      workerId: f.worker_id,
      name: nombre.get(f.worker_id) ?? f.worker_id,
      loadPoints: f.active_load_points,
    }));
  }

  // El nombre del responsable de cada tarea sale de `profiles`. Es
  // información interna del equipo y nunca llega al cliente: esta pantalla
  // es del espacio, y `tasks_select` ya le ha negado las filas.
  const assigneeIds = [...new Set((taskRows ?? []).map((t) => t.assignee_id).filter(Boolean))];
  const { data: responsables } = assigneeIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", assigneeIds as string[])
    : { data: [] };
  const nombrePorId = new Map(
    (responsables ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]),
  );

  const tasks: TaskRow[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    state: t.state,
    weight: t.weight as TaskRow["weight"],
    estimatedMinutes: t.estimated_minutes,
    assigneeId: t.assignee_id,
    assigneeName: t.assignee_id ? (nombrePorId.get(t.assignee_id) ?? null) : null,
  }));

  // CLAUDE.md MUST: la fecha que se propone es hoy en la zona del espacio.
  const hoy = todayInTimeZone(new Date(), space?.timezone ?? "Europe/Madrid");

  // Los cuatro estados en los que `create_job_task()` deja de admitir
  // altas. Se repite aquí solo para no pintar un formulario condenado; la
  // regla vive en la función.
  const terminado =
    job.state === "published" ||
    job.state === "completed" ||
    job.state === "cancelled_before_start" ||
    job.state === "cancelled_after_start";

  // §20.4 · los dos contadores y lo que pesa el trabajo. Se recalculan
  // desde sus eventos, no se leen de ningún campo (CA-10).
  const timers = await loadJobTimers(supabase, job);

  const responsable = job.assigned_to === null ? null : nombrePorId.get(job.assigned_to) ?? null;

  const blocked = job.state === "blocked_by_client" || job.state === "authorized_pause";
  const hasActions =
    job.state === "pending_assignment" ||
    job.state === "assigned" ||
    job.state === "in_progress" ||
    blocked;

  /*
    Maqueta 06 · el paginador "1 de 5" y la vuelta a la lista. La lista y
    su orden salen de `loadTeamJobs()`, el mismo sitio del que los lee la
    bandeja; la posición, de `listPosition()`, que no ordena nada. Si el
    trabajo no está en esa lista —enlace directo, o el filtro lo excluye—
    no se pinta paginador: "1 de 1" fingiría un recorrido.
  */
  const hermanos = await loadTeamJobs(supabase, job.space_id, restaurante);
  const posicion = listPosition(
    hermanos.map((hermano) => hermano.id),
    id,
  );
  const sufijo = restaurante === undefined ? "" : `?restaurante=${restaurante}`;
  const listaHref = `/espacios/${slug}/trabajos${sufijo}`;
  const pager =
    posicion === null
      ? undefined
      : {
          index: posicion.index,
          total: posicion.total,
          previousHref:
            posicion.previousId === null
              ? null
              : `/espacios/${slug}/trabajos/${posicion.previousId}${sufijo}`,
          nextHref:
            posicion.nextId === null
              ? null
              : `/espacios/${slug}/trabajos/${posicion.nextId}${sufijo}`,
        };

  /*
    Maqueta 06 · la evidencia de lo publicado. Son los archivos enlazados a
    este trabajo (RN-ARC-02, `file_links` con `entity_type = 'job'`), y las
    filas las filtra `can_read_file()`: quien no puede ver un archivo no lo
    ve aquí tampoco. `files` y `file_versions` tienen privilegios de
    columna, así que se enumeran — `select *` devolvería 403.
  */
  const { data: enlaces } = await supabase
    .from("file_links")
    .select("file_id, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const idsEvidencia = (enlaces ?? []).map((enlace) => enlace.file_id);

  const [{ data: archivosEvidencia }, { data: versionesEvidencia }] = idsEvidencia.length
    ? await Promise.all([
        supabase.from("files").select("id, name").in("id", idsEvidencia),
        supabase
          .from("file_versions")
          .select("file_id, size_bytes, mime_type, version_number")
          .in("file_id", idsEvidencia)
          .order("version_number", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  // La versión VIGENTE de cada archivo es la de número más alto, y las
  // filas llegan ordenadas: la primera que se ve de cada archivo es la
  // buena (RN-ARC-03, sustituir crea versión y la anterior permanece).
  const versionVigente = new Map<string, { size: number | null; mime: string | null }>();
  for (const version of versionesEvidencia ?? []) {
    if (!versionVigente.has(version.file_id)) {
      versionVigente.set(version.file_id, {
        size: version.size_bytes,
        mime: version.mime_type,
      });
    }
  }

  const nombreArchivo = new Map((archivosEvidencia ?? []).map((a) => [a.id, a.name]));

  const evidencia: EvidenceFile[] = (enlaces ?? [])
    // Un enlace cuyo archivo no se puede leer no se enseña como un hueco:
    // simplemente no está, que es lo que `can_read_file()` ha decidido.
    .filter((enlace) => nombreArchivo.has(enlace.file_id))
    .map((enlace) => ({
      id: enlace.file_id,
      name: nombreArchivo.get(enlace.file_id)!,
      sizeBytes: versionVigente.get(enlace.file_id)?.size ?? null,
      mimeType: versionVigente.get(enlace.file_id)?.mime ?? null,
      attachedAt: enlace.created_at,
    }));

  /*
    Maqueta 06 · la fecha estimada de fin. La decide `jobEnd()` en
    `src/core/`, con sus tests, porque en pausa NO hay fecha que dar: el
    tiempo restante se conserva y la fecha se movería sola (RN-JOB-08,
    RN-SLA-14). El recuento "Tareas (2/4)" lo hace `TaskBreakdown` con
    `taskProgress()`, en el mismo sitio donde se pintan.
  */
  const fin = jobEnd({
    state: job.state as JobState,
    publishedAt: job.published_at === null ? null : new Date(job.published_at),
    t3Started: timers.t3Started,
    deadlineAt: timers.t3DeadlineAt,
    hasDeadline: job.category !== null,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      {/*
        Maqueta 06 · volver a la lista y moverse por ella sin salir del
        detalle. Con su texto y no solo una flecha: en móvil no hay dónde
        posarse para leer un `title`.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={listaHref}
          className="flex shrink-0 items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <Icon name="arrowLeft" aria-hidden="true" className="h-[18px] w-[18px]" />
          {es.teamArea.jobs.backToList}
        </Link>

        {pager === undefined ? null : (
          <nav aria-label={es.teamArea.jobs.pagerLabel} className="flex shrink-0 items-center gap-1">
            <JobPagerLink
              href={pager.previousHref}
              icon="arrowLeft"
              label={es.teamArea.jobs.pagerPrevious}
            />
            <span className="whitespace-nowrap px-1 text-sm text-text-secondary">
              {es.teamArea.jobs.pagerPosition(pager.index, pager.total)}
            </span>
            <JobPagerLink
              href={pager.nextHref}
              icon="arrowRight"
              label={es.teamArea.jobs.pagerNext}
            />
          </nav>
        )}
      </div>

      <header>
        <p className="text-sm text-text-secondary">
          {job.code} · {establishment?.name ?? "—"}
        </p>
        {/*
          El título es el ALCANCE, no la palabra "Trabajo": quien abre esto
          quiere saber de qué va, y el código y el restaurante ya están
          encima. Si no hay solicitud legible, se cae al nombre genérico.
        */}
        <h1 className="text-2xl font-bold text-primary-dark">
          {request?.description ?? es.teamArea.jobs.detailTitle}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={jobTone(job.state)}>
            {es.naming.states.job[job.state as JobStateKey] ?? job.state}
          </StatusBadge>
          {/*
            RN-SLA-17 · "Fuera de plazo" va AL LADO del estado, nunca en su
            lugar: es una condición calculada que convive con En curso,
            Bloqueado o el que sea.
          */}
          {timers.outOfDeadline ? (
            <StatusBadge tone="danger">{es.teamArea.jobs.outOfDeadline}</StatusBadge>
          ) : null}
          {job.category ? (
            <span className="text-sm text-text-secondary">
              {es.naming.categories[job.category as CategoryKey] ?? job.category}
            </span>
          ) : null}
        </div>
      </header>

      {request ? (
        <Card title={es.teamArea.requests.descriptionColumn}>
          <p className="whitespace-pre-wrap text-text">{request.description}</p>
          <p className="mt-3 text-sm">
            <Link
              href={`/espacios/${slug}/solicitudes/${request.id}`}
              className="text-cuotly-green underline"
            >
              {request.code}
            </Link>
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title={es.teamArea.jobs.operativeTitle}>
          <div className="border-b border-border py-3">
            <p className="text-xs text-text-secondary">{es.teamArea.jobs.assigneeLabel}</p>
            {/*
              El nombre de quien lleva el trabajo es información del EQUIPO.
              Esta pantalla es del espacio y `jobs_select` ya le ha negado la
              fila al restaurante; aun así el nombre sale de `profiles` y no
              de una columna de `jobs`, que las de identidad están revocadas.
            */}
            <p className="text-sm font-semibold text-primary-dark">
              {responsable ?? es.teamArea.jobs.assigneeNone}
            </p>
          </div>

          {/*
            Maqueta 06 · fecha de inicio y fecha estimada de fin. La
            segunda es una AFIRMACIÓN sobre el futuro y por eso la decide
            `jobEnd()` en `src/core/`, con sus tests: en pausa NO se da
            ninguna fecha, porque el tiempo restante se conserva y la fecha
            se movería sola (RN-JOB-08, RN-SLA-14). Dar una fecha ahí sería
            mentir sin que fallara nada.
          */}
          <div className="border-b border-border py-3">
            <p className="text-xs text-text-secondary">{es.teamArea.jobs.startedAtLabel}</p>
            <p className="text-sm font-semibold text-primary-dark">
              {job.started_at === null
                ? es.teamArea.jobs.startedAtNone
                : fechaYHora(job.started_at)}
            </p>
          </div>

          <div className="border-b border-border py-3">
            <p className="text-xs text-text-secondary">
              {fin.kind === "published"
                ? es.teamArea.jobs.endPublishedLabel
                : es.teamArea.jobs.endLabel}
            </p>
            <p className="text-sm font-semibold text-primary-dark">
              {fin.kind === "published" || fin.kind === "estimated"
                ? fechaYHora(fin.at.toISOString())
                : FIN_SIN_FECHA[fin.kind].texto}
            </p>
            {/*
              El motivo, debajo. Sin él, "En pausa" a secas deja pensando
              si la fecha se ha perdido o si es que nadie la ha calculado.
            */}
            <p className="text-xs text-text-secondary">
              {fin.kind === "published" || fin.kind === "estimated"
                ? es.teamArea.jobs.endEstimatedHint
                : FIN_SIN_FECHA[fin.kind].motivo}
            </p>
          </div>

          {timers.t2Done ? (
            <Contador
              titulo={es.teamArea.jobs.t2Title}
              valor={es.teamArea.jobs.t2Done}
              pista={es.teamArea.jobs.t2DoneHint}
              tono="hecho"
            />
          ) : timers.t2 === null ? (
            <Contador
              titulo={es.teamArea.jobs.t2Title}
              valor={es.teamArea.jobs.t2NotStarted}
              pista={es.teamArea.jobs.t2NotStartedHint}
              tono="normal"
            />
          ) : (
            <Contador
              titulo={es.teamArea.jobs.t2Title}
              valor={
                timers.t2.overdue
                  ? es.teamArea.jobs.outOfDeadline
                  : es.teamArea.jobs.remaining(tiempoRestante(timers.t2.remainingMinutes))
              }
              pista={
                timers.t2.overdue ? es.teamArea.jobs.outOfDeadlineHint : es.teamArea.jobs.t2Hint
              }
              tono={timers.t2.overdue ? "alerta" : "normal"}
            />
          )}

          {timers.t3 === null ? (
            <Contador
              titulo={es.teamArea.jobs.t3Title}
              valor={es.teamArea.jobs.t3NotStarted}
              pista={es.teamArea.jobs.t3NotStartedHint}
              tono="normal"
            />
          ) : (
            <Contador
              titulo={es.teamArea.jobs.t3Title}
              valor={
                timers.t3.overdue
                  ? es.teamArea.jobs.outOfDeadline
                  : es.teamArea.jobs.remaining(tiempoRestante(timers.t3.remainingMinutes))
              }
              pista={
                timers.t3.overdue
                  ? es.teamArea.jobs.outOfDeadlineHint
                  : blocked
                    ? es.teamArea.jobs.t3PausedHint
                    : es.teamArea.jobs.t3Hint
              }
              tono={timers.t3.overdue ? "alerta" : "normal"}
            />
          )}
        </Card>

        <Card title={es.teamArea.jobs.detailsTitle}>
          <div className="border-b border-border py-3">
            <p className="text-xs text-text-secondary">{es.teamArea.jobs.categoryLabel}</p>
            <p className="text-sm font-semibold text-primary-dark">
              {job.category
                ? (es.naming.categories[job.category as CategoryKey] ?? job.category)
                : es.teamArea.jobs.categoryNone}
            </p>
          </div>

          <div className="border-b border-border py-3">
            <p className="text-xs text-text-secondary">{es.teamArea.jobs.consumedLabel}</p>
            {/*
              Un trabajo consume UN cambio de su categoría al aceptarse
              (RN-CON-01), y ninguno si el plan no incluye esa categoría:
              entonces se presupuesta aparte y decirlo es más útil que un
              cero (RN-COM-12).
            */}
            <p className="text-sm font-semibold text-primary-dark">
              {timers.loadPoints === null
                ? es.teamArea.jobs.consumedNone
                : es.teamArea.jobs.consumedOne}
            </p>
          </div>

          <div className="py-3">
            <p className="text-xs text-text-secondary">{es.teamArea.jobs.loadPointsLabel}</p>
            <p className="text-sm font-semibold text-primary-dark">
              {timers.loadPoints === null
                ? es.teamArea.jobs.loadPointsNone
                : es.teamArea.jobs.loadPointsValue(timers.loadPoints)}
            </p>
          </div>
        </Card>
      </div>

      {/*
        HU-27 · "marcar como pagado un cobro de un restaurante asignado,
        **sin entrar en Finanzas**". El trabajador entra a su restaurante
        por el trabajo, así que el cobro se registra aquí mismo. Es el
        mismo formulario y la misma función que en Finanzas: lo que le
        está vedado —cambiar precios, perdonar deuda, reembolsar— no está
        aquí porque tampoco se lo permitiría el servidor (RN-FIN-05).

        Se enseña a todo el equipo que llega a esta pantalla, no solo al
        trabajador: al administrador le ahorra el rodeo por Finanzas.
      */}
      <Card title={es.teamArea.jobs.chargesTitle}>
        {outstandingCharges.length === 0 ? (
          <EmptyState
            title={es.teamArea.jobs.chargesEmptyTitle}
            description={es.teamArea.jobs.chargesEmptyReason}
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-text-secondary">{es.teamArea.jobs.chargesHint}</p>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{es.teamArea.finance.conceptColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.teamArea.finance.dueColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.teamArea.jobs.chargesOutstandingColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.teamArea.finance.registerTitle}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {outstandingCharges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell>{charge.concept}</TableCell>
                    <TableCell>
                      {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                        new Date(charge.due_at),
                      )}
                    </TableCell>
                    <TableCell>{euros(charge.outstanding)}</TableCell>
                    <TableCell>
                      <RegisterPaymentForm
                        chargeId={charge.id}
                        establishmentId={job.establishment_id}
                        outstandingEuros={(charge.outstanding / 100).toFixed(2)}
                        defaultDay={hoy}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {/*
        HU-21 · el desglose. Se enseña siempre que haya tareas, aunque el
        trabajo ya esté terminado: en ese caso el servidor no admite altas
        ni cambios y lo que queda es el historial de cómo se repartió
        (RN-JOB-13, que las conserva). El alta solo aparece mientras el
        trabajo sigue vivo, que es lo que admite `create_job_task()`.
      */}
      {tasks.length > 0 || puedeDesglosar ? (
        <TaskBreakdown
          jobId={id}
          tasks={tasks}
          candidates={taskCandidates}
          canAdd={puedeDesglosar && !terminado}
          canCancel={Boolean(puedeAsignar)}
        />
      ) : null}

      {/*
        §66.2 · la coordinación del equipo sobre este trabajo. Se ofrece
        siempre, en cualquier estado: un trabajo terminado también se
        comenta, y el historial de cómo se coordinó no se cierra con él.
        Quién puede abrirla lo decide `get_or_create_job_conversation()`,
        que exige ser del espacio y poder leer el trabajo — al cliente,
        que sí puede leer la ficha de su trabajo, le dice que no
        (RN-MSG-04).
      */}
      {/*
        Maqueta 06 · la evidencia de lo publicado, al lado de los
        comentarios. Solo al equipo: el restaurante puede abrir la ficha de
        su trabajo y ni adjunta ni ve el catálogo interno (P7).
      */}
      {esDelEquipo ? (
        <JobEvidence
          jobId={id}
          establishmentId={job.establishment_id}
          files={evidencia}
          /*
            Quién puede adjuntar es lo mismo que comprueba
            `attach_job_evidence()`: el responsable o `assign_jobs`. Se
            pregunta para no pintar un formulario que el servidor va a
            rechazar; lo que lo impide de verdad es él.
          */
          canAttach={puedeDesglosar}
          publicado={job.published_at !== null}
        />
      ) : null}

      {esDelEquipo ? <OpenInternalConversationForm jobId={id} slug={slug} /> : null}

      {job.state === "pending_assignment" ? (
        <AssignJobForm jobId={id} candidates={candidates} />
      ) : null}

      {job.state === "assigned" ? <StartJobForm jobId={id} /> : null}

      {job.state === "in_progress" ? (
        <>
          <PublishJobForm jobId={id} spaceId={job.space_id} />
          <BlockJobForm jobId={id} />
        </>
      ) : null}

      {blocked ? <UnblockJobForm jobId={id} /> : null}

      {hasActions ? null : (
        <Card title={es.teamArea.jobs.noActionTitle}>
          <p className="text-sm text-text-secondary">{es.teamArea.jobs.noActionReason}</p>
        </Card>
      )}
    </div>
  );
}
