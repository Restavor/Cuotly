"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  contractualCalendar,
  addBusinessMinutes,
  holidaysKnownAsOf,
  type HolidayRecord,
} from "@/core/business-clock";
import { FREE_CORRECTION_WINDOW_BUSINESS_HOURS } from "@/core/free-correction";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import type { JobActionState } from "./action-state";

async function run(
  fn: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
): Promise<JobActionState> {
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { error: error.message, done: false };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * HU-17 · asignar. El candidato lo elige quien asigna; la lista y su orden
 * los calcula el servidor.
 *
 * Llama a `assign_job()`, que es la puerta de entrada, y NO a
 * `apply_job_assignment()`, que es el ayudante interno que comparte con
 * `auto_assign_job()` y `approve_job_reassignment()`. Llamaba al ayudante,
 * y el ayudante no comprueba nada: la capacidad `assign_jobs`, la
 * idempotencia de CA-17 ("pulsar dos veces asignar no duplica nada"), que
 * el trabajo esté pendiente de asignación y que la persona sea un
 * candidato válido (RN-ASG-02, "asignar a alguien sin acceso a ese
 * establecimiento sería concederle acceso por la puerta de atrás") están
 * todas en `assign_job()`.
 *
 * En la práctica no se saltaba ningún control, porque el ayudante tiene
 * revocado el EXECUTE de `authenticated` (migración 20260830000024) y
 * PostgREST devolvía 403: la red de seguridad hizo su trabajo y el botón
 * no asignaba a nadie. Pero el botón tenía que llamar a la puerta, no a la
 * ventana.
 */
export async function assignJob(
  _prev: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const workerId = String(formData.get("workerId") ?? "");
  return run((s) =>
    s.rpc("assign_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_reason: undefined,
    }),
  );
}

/** HU-18 · comenzar. Arranca T3 y para T2; lo decide el servidor. */
export async function startJob(
  _prev: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  return run((s) => s.rpc("start_job", { p_job_id: jobId }));
}

/** HU-19 · bloquear, con su motivo. Un bloqueo detiene el contador de ejecución. */
export async function blockJob(
  _prev: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const reasonType = String(formData.get("reasonType") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  return run((s) =>
    s.rpc("block_job", { p_job_id: jobId, p_reason_type: reasonType, p_note: note || undefined }),
  );
}

export async function unblockJob(
  _prev: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  return run((s) => s.rpc("unblock_job", { p_job_id: jobId, p_note: undefined, p_reverted: false }));
}

/**
 * HU-20 · publicar. RN-COR-02: la ventana de corrección son 72 h
 * **laborables** desde la publicación, y el reloj laborable vive en
 * `src/core/business-clock.ts` — no en SQL, para que haya una sola
 * definición (CLAUDE.md).
 *
 * La fecha se calcula aquí con los festivos que el espacio tiene dados de
 * alta hasta hoy (RN-CLK-10) y el servidor la valida antes de guardarla:
 * `publish_job()` rechaza una fecha pasada o absurdamente lejana, así que
 * esta capa no puede colar una ventana inventada.
 */
export async function publishJob(
  _prev: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const spaceId = String(formData.get("spaceId") ?? "");

  const supabase = await createClient();

  const [{ data: space }, { data: holidayRows }] = await Promise.all([
    supabase.from("spaces").select("timezone").eq("id", spaceId).maybeSingle(),
    supabase.from("holidays").select("holiday_date, created_at").eq("space_id", spaceId),
  ]);

  const now = new Date();
  const holidays: HolidayRecord[] = (holidayRows ?? []).map((row) => ({
    date: row.holiday_date,
    configuredAt: new Date(row.created_at),
  }));

  const calendar = contractualCalendar(
    space?.timezone ?? "Europe/Madrid",
    holidaysKnownAsOf(holidays, now),
  );
  const windowEndsAt = addBusinessMinutes(
    now,
    FREE_CORRECTION_WINDOW_BUSINESS_HOURS * 60,
    calendar,
  );

  const { error } = await supabase.rpc("publish_job", {
    p_job_id: jobId,
    p_correction_window_ends_at: windowEndsAt.toISOString(),
  });

  if (error) return { error: error.message, done: false };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * §66.2 · abrir la conversación interna de un trabajo.
 *
 * Se crea al pulsar, no al mirar la ficha. Es la diferencia con la
 * conversación de una solicitud, que sí se crea al abrir la pantalla: allí
 * hay una por solicitud y siempre acaba usándose, mientras que crear una
 * interna por cada trabajo que alguien mira de pasada llenaría la bandeja
 * de §66.2 de conversaciones vacías.
 *
 * `get_or_create_job_conversation()` comprueba dos cosas que esta capa no
 * puede: que quien llama sea del espacio —que es lo que deja al cliente
 * fuera, RN-MSG-04— y que pueda leer ese trabajo (RN-MSG-03). Si dice que
 * no, se enseña el motivo; no se decide aquí.
 */
export async function openJobInternalConversation(
  _prev: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!jobId || !slug) return { error: null, done: false };

  const supabase = await createClient();
  const { data: conversationId, error } = await supabase.rpc("get_or_create_job_conversation", {
    p_job_id: jobId,
  });

  if (error || !conversationId) {
    return { error: error?.message ?? es.states.errorDescription, done: false };
  }

  redirect(`/espacios/${slug}/mensajes/${conversationId}`);
}
