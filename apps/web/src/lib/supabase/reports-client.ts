/* eslint-disable @typescript-eslint/no-explicit-any --
   Frontera única y documentada: ver el comentario de abajo. */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `database.types.ts` se **genera** desde el proyecto real de Supabase
 * (`docs/DESPLIEGUE-SUPABASE.md`), así que no conoce las tablas ni las
 * funciones de la migración 85 hasta que Bosco la aplique y se regeneren
 * los tipos. Editar ese archivo a mano no serviría: la siguiente
 * generación lo borraría.
 *
 * Así que la frontera está **aquí y solo aquí**, en un archivo de cuatro
 * líneas, en vez de repartida en cada pantalla. Es lo mismo que pasó con
 * el Hito 15, y allí quitarla al regenerar los tipos destapó dos fallos
 * reales — motivo de más para que cuando se aplique la 85 se quite esta y
 * las llamadas vuelvan al cliente tipado.
 */
export type ReportsClient = SupabaseClient<any, any, any>;

export function reportsClient(client: unknown): ReportsClient {
  return client as ReportsClient;
}
