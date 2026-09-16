/**
 * RN-MOV-09 · qué se puede hacer sin conexión y qué no (§144).
 *
 * Sin conexión se **consulta lo reciente** y se **redactan borradores** de
 * solicitudes y mensajes. Pagar, aceptar, consumir, publicar y completar
 * exigen servidor: el botón se deshabilita con el motivo y **no se encola
 * nada** —una aceptación que se ejecutara sola horas después contra un
 * estado que ya cambió es exactamente lo que §144 prohíbe—.
 *
 * Es un módulo puro para que la regla tenga test (CLAUDE.md) y para que
 * cada pantalla la pregunte en vez de decidirla por su cuenta.
 */
export const OFFLINE_ACTIONS = ["draft_request", "draft_message", "read_cached"] as const;

export const SERVER_ONLY_ACTIONS = [
  "submit_request",
  "accept_request",
  "assign_job",
  "start_job",
  "block_job",
  "unblock_job",
  "publish_job",
  "request_correction",
  "register_payment",
  "upload_receipt",
  "accept_quote",
  "save_menu_version",
  "prepare_menu",
  "request_menu_publication",
  "set_supervisor",
  "set_preference",
  "send_message",
  "complete_task",
] as const;

export type OfflineAction = (typeof OFFLINE_ACTIONS)[number];
export type ServerOnlyAction = (typeof SERVER_ONLY_ACTIONS)[number];
export type AppAction = OfflineAction | ServerOnlyAction;

export function canRunOffline(action: AppAction): boolean {
  return (OFFLINE_ACTIONS as readonly string[]).includes(action);
}

/**
 * Un botón de acción crítica sin conexión se deshabilita **con motivo**;
 * con conexión, se habilita. Nunca se encola: el resultado no tiene un
 * tercer valor.
 */
export type ActionGate = { readonly enabled: true } | { readonly enabled: false; readonly reason: "offline" };

export function gateAction(action: AppAction, online: boolean): ActionGate {
  if (online || canRunOffline(action)) return { enabled: true };
  return { enabled: false, reason: "offline" };
}
