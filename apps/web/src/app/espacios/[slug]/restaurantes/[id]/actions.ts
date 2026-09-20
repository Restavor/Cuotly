"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { clasificarSolicitud } from "@/services/request-classification";
import { es } from "@/i18n/es";

import type { ServiceStatusState } from "@/components/establishment/service-status-action-state";

export type RequestFormState = { error: string | null; created: boolean };

/**
 * El cliente pide un cambio (HU-10). Dos pasos, los dos en el servidor:
 * `create_request_draft()` guarda el borrador y `submit_request()` lo envía
 * y arranca T1.
 *
 * Ni el estado ni el arranque del contador se deciden aquí: si el servicio
 * del restaurante está detenido, `submit_request()` lanza y esta acción
 * solo traduce el mensaje. Ocultar el formulario no es un control de
 * acceso (CLAUDE.md).
 */
export async function submitNewRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  // RN-REQ-05 · los dos van al servidor tal cual. Que el nivel sea uno de
  // los tres y que el motivo quepa en 200 lo comprueba
  // `create_request_draft()`, y que no falten, `submit_request()`: aquí no
  // se repite ninguna de las dos reglas, porque una segunda copia acaba
  // diciendo otra cosa.
  const priority = String(formData.get("priority") ?? "").trim();
  const priorityReason = String(formData.get("priorityReason") ?? "").trim();

  if (!description) {
    return { error: es.clientArea.newValidationRequired, created: false };
  }

  const supabase = await createClient();

  const { data: requestId, error: draftError } = await supabase.rpc("create_request_draft", {
    p_establishment_id: establishmentId,
    p_description: description,
    p_context: context || undefined,
    p_priority: priority || undefined,
    p_priority_reason: priorityReason || undefined,
  });

  if (draftError || !requestId) {
    return { error: draftError?.message ?? es.states.errorDescription, created: false };
  }

  const { error: submitError } = await supabase.rpc("submit_request", {
    p_request_id: requestId,
  });

  if (submitError) {
    return { error: submitError.message, created: false };
  }

  // RN-CLS-01: la clasificación ocurre "al enviarse una solicitud", aquí
  // y no en una pantalla del equipo. Y no se comprueba el resultado a
  // propósito: RN-CLS-02 dice que el flujo NUNCA se bloquea por la IA. La
  // solicitud ya está enviada y el contador de primera atención ya corre;
  // si la clasificación no sale, la solicitud se queda en "Recibida" y el
  // equipo tiene un botón para reintentarla.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await clasificarSolicitud(supabase, {
      requestId,
      actorId: user.id,
      description,
      context,
    });
  }

  revalidatePath(`/espacios`, "layout");
  return { error: null, created: true };
}

export type AcceptState = { error: string | null; accepted: boolean };

/**
 * El cliente acepta (HU-14, RN-REQ-02). La transacción, el bloqueo de fila
 * y el consumo del crédito los hace `accept_request()` en el servidor: dos
 * clics seguidos no consumen dos créditos (CA-17).
 */
export async function acceptRequest(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: null, accepted: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_request", { p_request_id: requestId });

  if (error) {
    return { error: error.message, accepted: false };
  }

  revalidatePath(`/espacios`, "layout");
  return { error: null, accepted: true };
}

export type RevokeAccessState = { error: string | null; revoked: boolean };

/**
 * Maqueta 15 · retirar el acceso de un usuario del restaurante (RN-EST-05).
 *
 * La regla entera vive en `revoke_establishment_access()` y
 * `revoke_group_access()`, que existen desde la revisión de Fase 1 y hasta
 * hoy **no las llamaba ninguna pantalla** — el propio texto de la pestaña
 * lo decía: "el botón todavía no está". Esta acción es ese botón.
 *
 * Qué NO decide esta acción: quién puede retirar (lo comprueba
 * `has_capability(..., 'manage_clients')` dentro de la función), ni qué
 * pasa con lo que esa persona hizo (RN-EST-05: el acceso desaparece de
 * inmediato y la actividad histórica permanece; la fila se marca, no se
 * borra). Ocultar el botón no es un control de acceso: quien no pueda,
 * recibe la excepción del servidor aunque llame a la acción a mano
 * (CLAUDE.md).
 *
 * El acceso de un **propietario global** no cuelga del restaurante sino de
 * su grupo, así que se retira con la otra función. Mandar el uno al otro
 * no fallaría ruidosamente: `revoke_establishment_access()` es idempotente
 * y devolvería `false`, es decir, "no había nada que retirar" — y el
 * propietario seguiría entrando. Por eso el origen viaja en el formulario.
 */
export async function revokeClientAccess(
  _prev: RevokeAccessState,
  formData: FormData,
): Promise<RevokeAccessState> {
  const userId = String(formData.get("userId") ?? "");
  const source = String(formData.get("source") ?? "");
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) return { error: null, revoked: false };

  const supabase = await createClient();

  const { error } =
    source === "group"
      ? await supabase.rpc("revoke_group_access", {
          p_group_id: groupId,
          p_user_id: userId,
          p_reason: reason || undefined,
        })
      : await supabase.rpc("revoke_establishment_access", {
          p_establishment_id: establishmentId,
          p_user_id: userId,
          p_reason: reason || undefined,
        });

  if (error) return { error: error.message, revoked: false };

  revalidatePath(`/espacios`, "layout");
  return { error: null, revoked: true };
}

export type GrantAccessState = {
  error: string | null;
  granted: number;
  /** `true` cuando lo concedido es el grupo entero, futuros incluidos. */
  future: boolean;
  /**
   * RN-ACC-13 · `true` cuando el correo **no tenía cuenta** y lo que se ha
   * creado es una invitación, no un acceso. Son dos resultados distintos y
   * la pantalla los dice distinto: uno ya está dentro, el otro tiene que
   * abrir un enlace — y, si invitó el restaurante, esperar a que el equipo
   * lo apruebe.
   */
  invited: boolean;
};

/**
 * Maqueta 15 · "Añadir usuario" (RN-EST-04, RN-ACC-13).
 *
 * **Ya no hace falta que exista.** Hasta la decisión 59 esta pantalla solo
 * admitía correos con cuenta de Cuotly, así que un restaurante no podía
 * meter a su encargado. Ahora llama a `invite_to_establishment_panel()`,
 * que **decide sola** cuál de los dos caminos toca: con cuenta, el acceso
 * en el momento; sin cuenta, una invitación que crea la cuenta al
 * aceptarse. Quien llama no elige — así la pantalla no puede equivocarse.
 *
 * Los dos caminos de GRUPO siguen exigiendo cuenta: invitar a alguien a un
 * grupo entero de restaurantes es otra cosa y nadie la ha pedido todavía.
 *
 * Lo que esta acción NO decide: el rol que de verdad queda, los permisos
 * finos (RN-EST-11 y RN-FIN-07 los normalizan en el servidor: un Consulta
 * no recibe ninguno por mucho que se marquen), ni quién puede dar acceso.
 * Todo eso lo comprueba la función. Aquí solo se traduce el error.
 */
export async function grantClientAccess(
  _prev: GrantAccessState,
  formData: FormData,
): Promise<GrantAccessState> {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  // Los cuatro casos de RN-EST-04: uno (este), todos los actuales, o todos
  // los actuales y futuros. "Varios" es repetir "uno".
  const scope = String(formData.get("scope") ?? "this");
  const editData = formData.get("editData") !== null;
  const viewBilling = formData.get("viewBilling") !== null;

  if (!email) return { error: null, granted: 0, future: false, invited: false };

  const supabase = await createClient();

  if (scope === "allFuture") {
    // Una membresía de grupo con rol editor (migración 74). El rol se
    // manda tal cual: si no es Editor, la función lo rechaza con su
    // mensaje — a nivel de grupo no existen los demás roles.
    const { error } = await supabase.rpc("grant_group_future_establishments_access", {
      p_group_id: groupId,
      p_email: email,
      p_role: role,
    });
    if (error) return { error: error.message, granted: 0, future: false, invited: false };
    revalidatePath("/espacios", "layout");
    return { error: null, granted: 0, future: true, invited: false };
  }

  if (scope === "allCurrent") {
    const { data, error } = await supabase.rpc("grant_group_current_establishments_access", {
      p_group_id: groupId,
      p_email: email,
      p_role: role,
      p_edit_establishment_data: editData,
      p_view_billing: viewBilling,
    });
    if (error) return { error: error.message, granted: 0, future: false, invited: false };
    revalidatePath("/espacios", "layout");
    return { error: null, granted: data ?? 0, future: false, invited: false };
  }

  const { data, error } = await supabase.rpc("invite_to_establishment_panel", {
    p_establishment_id: establishmentId,
    p_email: email,
    p_role: role,
    p_edit_establishment_data: editData,
    p_view_billing: viewBilling,
  });

  if (error) return { error: error.message, granted: 0, future: false, invited: false };

  revalidatePath("/espacios", "layout");
  // La función devuelve el id de la invitación, o `null` cuando el correo
  // ya tenía cuenta y el acceso se dio en el momento. Ese `null` **es** la
  // respuesta, no un fallo.
  return { error: null, granted: data === null ? 1 : 0, future: false, invited: data !== null };
}

export type AcceptTermsState = { error: string | null; accepted: boolean };

/**
 * Maqueta 13 · opción (a) de la decisión del 12/09/2026: el propietario
 * del restaurante acepta la versión vigente de las condiciones. Quién
 * puede (`client_can_accept_terms()`) y que la versión sea la vigente lo
 * decide `accept_subscription_terms()`; pulsar dos veces devuelve la
 * misma aceptación (CA-17).
 */
export async function acceptTerms(
  _prev: AcceptTermsState,
  formData: FormData,
): Promise<AcceptTermsState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_subscription_terms", {
    p_subscription_id: subscriptionId,
    p_version_id: versionId,
  });

  if (error) return { error: error.message, accepted: false };

  revalidatePath("/espacios", "layout");
  return { error: null, accepted: true };
}

/**
 * R24 · RN-EST-09 — el restaurante comunica su propia baja.
 *
 * `request_service_termination()` comprueba que quien llama pueda escribir
 * en el restaurante y que siga teniendo servicio. Aquí no se comprueba
 * nada de eso, y `p_requested_by_client` va en `true` porque lo está
 * pidiendo el restaurante: la función rechaza un `false` a quien no sea del
 * equipo, así que el parámetro no es una promesa del navegador.
 */
export async function requestOwnTermination(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: es.clientArea.termination.reasonRequired, done: false };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("request_service_termination", {
      p_establishment_id: establishmentId,
      p_reason: reason,
      p_requested_by_client: true,
    });
    if (error) return { error: error.message, done: false };

    revalidatePath("/espacios", "layout");
    return { error: null, done: true };
  } catch (fallo) {
    console.error("[restaurante] la baja no se pudo comunicar", { message: String(fallo) });
    return { error: es.states.errorDescription, done: false };
  }
}
