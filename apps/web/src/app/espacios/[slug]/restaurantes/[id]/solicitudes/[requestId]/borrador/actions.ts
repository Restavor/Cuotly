"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canSubmitDraft } from "@/core/request-draft";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { clasificarSolicitud } from "@/services/request-classification";

import type {
  DraftCopyState,
  DraftFileState,
  DraftScopeState,
  DraftSubmitState,
} from "./action-state";

/**
 * §68 · "antes de enviar se revisa el ALCANCE".
 *
 * Quién puede, en qué estado y con qué versión lo decide
 * `update_request_draft()` en el servidor: comprueba
 * `can_write_establishment()`, exige que la solicitud siga siendo un
 * borrador, bloquea la fila y escribe la versión siguiente en
 * `request_versions` (RN-DAT-07). Esta acción no comprueba ninguna de las
 * tres: si la pantalla ofreciera el formulario cuando no toca, la función
 * lanza y aquí solo se traduce el motivo.
 *
 * Devuelve `unchanged` cuando no había nada que guardar, para no prometer
 * un guardado que el servidor —con razón— no ha versionado.
 */
export async function saveDraftScope(
  _prev: DraftScopeState,
  formData: FormData,
): Promise<DraftScopeState> {
  const requestId = String(formData.get("requestId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  const previousVersion = Number(formData.get("version") ?? 0);
  // RN-REQ-05 · la prioridad se revisa aquí también: un borrador que sale
  // de una conversación no la trae, y sin ella `submit_request()` no lo
  // deja enviar.
  const priority = String(formData.get("priority") ?? "").trim();
  const priorityReason = String(formData.get("priorityReason") ?? "").trim();
  const priorityChanged =
    priority !== String(formData.get("previousPriority") ?? "") ||
    priorityReason !== String(formData.get("previousPriorityReason") ?? "");

  if (!description) {
    return { error: es.clientArea.draftEmptyScope, saved: false, unchanged: false };
  }

  const supabase = await createClient();
  const { data: version, error } = await supabase.rpc("update_request_draft", {
    p_request_id: requestId,
    p_description: description,
    p_context: context || undefined,
    p_priority: priority || undefined,
    p_priority_reason: priorityReason || undefined,
  });

  if (error) return { error: error.message, saved: false, unchanged: false };

  revalidatePath("/espacios", "layout");

  // El servidor devuelve la versión que ha quedado. Si es la misma que
  // había, es que no cambió nada: RN-DAT-07 versiona cambios, no
  // guardados.
  const unchanged = typeof version === "number" && version === previousVersion && !priorityChanged;
  return { error: null, saved: !unchanged, unchanged };
}

/**
 * §68 · "se revisan los ARCHIVOS" — añadir uno.
 *
 * El archivo llega ya subido y registrado por `FileUploadField`; por aquí
 * viaja solo su identificador. `attach_file_to_request_draft()` comprueba
 * lo que esta capa no puede: que la solicitud siga en borrador, que quien
 * adjunta pueda escribir en el restaurante, que pueda VER ese archivo y
 * que el archivo sea de este mismo restaurante.
 */
export async function attachDraftFile(
  _prev: DraftFileState,
  formData: FormData,
): Promise<DraftFileState> {
  const requestId = String(formData.get("requestId") ?? "");
  const fileId = String(formData.get("attachmentFileId") ?? "").trim();

  if (!fileId) return { error: null, done: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("attach_file_to_request_draft", {
    p_request_id: requestId,
    p_file_id: fileId,
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * §68 · "se revisan los ARCHIVOS" — quitar uno que no venía a cuento.
 *
 * Quitar no borra el archivo: `detach_file_from_request_draft()` borra el
 * ENLACE con el borrador y solo mientras es borrador. El archivo sigue en
 * el catálogo del restaurante y en el mensaje del que vino (CLAUDE.md
 * MUST NOT, RN-MSG-08).
 */
export async function detachDraftFile(
  _prev: DraftFileState,
  formData: FormData,
): Promise<DraftFileState> {
  const requestId = String(formData.get("requestId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");

  if (!requestId || !fileId) return { error: null, done: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("detach_file_from_request_draft", {
    p_request_id: requestId,
    p_file_id: fileId,
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * §68 · enviar el borrador ya revisado. Es el mismo camino que HU-10 desde
 * el formulario de "Pedir un cambio": `submit_request()` lo pasa a
 * "Recibida" y arranca T1 (RN-SLA-01), y después se clasifica.
 *
 * La clasificación no se comprueba a propósito: RN-CLS-02 dice que el
 * flujo NUNCA se bloquea por la IA. La solicitud ya está enviada y el
 * contador ya corre; si la clasificación no sale, se queda en "Recibida" y
 * el equipo tiene un botón para reintentarla.
 */
export async function submitDraft(
  _prev: DraftSubmitState,
  formData: FormData,
): Promise<DraftSubmitState> {
  const slug = String(formData.get("slug") ?? "");
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");

  const supabase = await createClient();

  // El alcance se lee de la base, NO del formulario, y no es una manía: lo
  // que se envía tiene que ser lo que está guardado. Si viniera del
  // navegador, quien escribiera en el cuadro de texto sin pulsar "Guardar
  // el alcance" enviaría una solicitud que dice una cosa y se clasifica
  // por otra (CLAUDE.md: el cliente nunca es la autoridad).
  const { data: request } = await supabase
    .from("requests")
    .select("state, description, context")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: es.clientArea.draftNotFoundTitle };

  // El mismo cálculo que hace el servidor, para poder decir el motivo en
  // vez de mandar una llamada que ya se sabe que va a fallar. No autoriza
  // nada: `submit_request()` vuelve a decidirlo.
  const permitido = canSubmitDraft({ state: request.state, description: request.description });
  if (!permitido.ok) {
    return {
      error:
        permitido.error === "empty_scope"
          ? es.clientArea.draftEmptyScope
          : es.clientArea.draftAlreadySent,
    };
  }

  const { error } = await supabase.rpc("submit_request", { p_request_id: requestId });

  if (error) return { error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await clasificarSolicitud(supabase, {
      requestId,
      actorId: user.id,
      description: request.description,
      context: request.context ?? "",
    });
  }

  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${slug}/restaurantes/${establishmentId}/solicitudes/${requestId}`);
}

/**
 * R07 · RN-REQ-04 — copiar este borrador a otro restaurante **del mismo
 * grupo**.
 *
 * Aquí no se comprueba ni el grupo ni el permiso, y es deliberado:
 * `copy_paste_request()` exige leer el origen, escribir en el destino y que
 * los dos cuelguen del mismo grupo, y lanza con su motivo si algo falta.
 * Repetir la regla en el navegador sería una segunda copia que un día diría
 * otra cosa (CLAUDE.md: el cliente nunca es la autoridad).
 *
 * El borrador nuevo nace en `draft` con sus adjuntos copiados y **no se
 * envía solo**: RN-REQ-04 pide que se revisen antes. Por eso se lleva a la
 * pantalla de revisión del nuevo, que es donde se revisan.
 */
export async function copyDraftToEstablishment(
  _prev: DraftCopyState,
  formData: FormData,
): Promise<DraftCopyState> {
  const slug = String(formData.get("slug") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const targetId = String(formData.get("targetEstablishmentId") ?? "");

  if (!targetId) return { error: es.clientArea.draftCopyChoose };

  const supabase = await createClient();
  const { data: nuevo, error } = await supabase.rpc("copy_paste_request", {
    p_source_request_id: requestId,
    p_target_establishment_id: targetId,
  });

  if (error) return { error: error.message };
  if (typeof nuevo !== "string") return { error: es.clientArea.draftCopyFailed };

  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${slug}/restaurantes/${targetId}/solicitudes/${nuevo}/borrador`);
}
