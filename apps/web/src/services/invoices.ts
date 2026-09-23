/**
 * El punto de conexión del **agente de facturas** (pendiente).
 *
 * Finanzas tiene la pestaña "Facturas" (M52) y hoy no hay nada detrás:
 * CLAUDE.md aplaza deliberadamente la numeración fiscal de las facturas,
 * y Bosco ha decidido (23/09/2026) que las facturas las hará un agente que
 * todavía no existe. Esta función es el único sitio por el que la
 * pantalla pregunta por ellas, así que conectar el agente es cambiar esto
 * y nada más: la pestaña ya pinta los tres casos.
 *
 * **Qué no hay aquí, a propósito.** Ni la forma de una factura (número,
 * serie, receptor, impuestos) ni una tabla: todo eso es lo que el bloque
 * fiscal tiene que decidir, e inventarlo ahora sería fijar una regla que
 * nadie ha dado (CLAUDE.md, "No inventes lo que está pendiente"). Cuando
 * el agente exista, añade aquí la variante `ok` con su forma, y la
 * pestaña la pinta.
 *
 * Las reglas que ya obligan a lo que se conecte: validar en el servidor,
 * `space_id` y RLS en toda tabla nueva, `manage_finance` para verla
 * (CA-03), y nada de identidad del equipo hacia el restaurante.
 */
export type InvoiceListing =
  /** Todavía no hay ningún agente de facturas conectado. */
  | { readonly kind: "not_connected" }
  /** Está conectado y no ha contestado. Se dice; no se pinta vacío. */
  | { readonly kind: "failed" };

/**
 * Sin argumentos mientras no haya nada que leer: el agente añadirá lo que
 * necesite (el espacio, el cliente de Supabase) al conectarse, y la única
 * llamada está en `finanzas/page.tsx`.
 */
export async function loadSpaceInvoices(): Promise<InvoiceListing> {
  return { kind: "not_connected" };
}
