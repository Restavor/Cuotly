/**
 * `src/services/app-gateway.ts` — la mitad de Supabase de Restavor app, la
 * puerta común (PRD de agents §4; migraciones 156 a 158).
 *
 * Aquí no se decide nada: qué productos tiene una persona lo dice
 * `my_products()` (RN-APP-01), quién puede pedir Reservas lo dice
 * `request_reservations()` y las condiciones vigentes salen de
 * `reservation_service_terms()`. Esto solo traduce lo que devuelven.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isProductRowKind, type ProductRow } from "@/core/app/products";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

async function rpc<F extends keyof Functions>(
  client: Client,
  fn: F,
  args: Functions[F]["Args"],
): Promise<Functions[F]["Returns"]> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as Functions[F]["Returns"];
}

/** RN-APP-01 · qué productos puede abrir, contratar o ha solicitado esta persona. */
export async function myProducts(client: Client): Promise<readonly ProductRow[]> {
  const rows = await rpc(client, "my_products", undefined as never);
  return rows
    .filter((row) => isProductRowKind(row.kind))
    .map((row) => ({
      kind: row.kind as ProductRow["kind"],
      spaceId: row.space_id,
      spaceSlug: row.space_slug,
      establishmentId: row.establishment_id,
      establishmentName: row.establishment_name,
      detail: row.detail,
      reason: row.reason,
      at: row.at,
    }));
}

/** Las condiciones vigentes de Reservas que se le ofrecen a quien aún no las ha contratado. */
export interface ReservationTerms {
  readonly serviceVersionId: string;
  readonly version: number;
  readonly conditions: string;
  readonly priceCents: number;
}

export async function reservationTerms(
  client: Client,
  establishmentId: string,
): Promise<ReservationTerms | null> {
  const rows = await rpc(client, "reservation_service_terms", { p_establishment_id: establishmentId });
  const row = rows[0];
  if (!row) return null;
  return {
    serviceVersionId: row.service_version_id,
    version: row.version,
    conditions: row.conditions,
    priceCents: row.price_cents,
  };
}

/** RN-APP-03 · el restaurante pide Reservas aceptando las condiciones. Devuelve la solicitud. */
export function requestReservations(
  client: Client,
  establishmentId: string,
  serviceVersionId: string,
  idempotencyKey: string,
): Promise<string> {
  return rpc(client, "request_reservations", {
    p_establishment_id: establishmentId,
    p_service_version_id: serviceVersionId,
    p_idempotency_key: idempotencyKey,
  });
}

/** RN-APP-03 · el equipo la crea en nombre del restaurante, sin aceptación todavía. */
export function createReservationRequestOnBehalf(
  client: Client,
  establishmentId: string,
  idempotencyKey: string,
): Promise<string> {
  return rpc(client, "create_reservation_request_on_behalf", {
    p_establishment_id: establishmentId,
    p_idempotency_key: idempotencyKey,
  });
}
