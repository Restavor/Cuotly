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
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { tiempoRestante } from "@/i18n/duration";
import { createClient } from "@/lib/supabase/server";

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

export default async function TeamJobDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
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
