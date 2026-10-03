/**
 * `src/services/agents/team-gateway.ts` · la mitad de Supabase del Equipo, los dispositivos del local y el
 * Historial (Fase D de Restavor agents; PRD §3.3, §3.4 y §11.1; migración 170).
 *
 * Aquí no se decide nada: quién puede añadir a alguien, si un PIN ya está en uso o qué dispositivo se
 * desactiva lo dicen `add_reservation_staff()`, `revoke_reservation_device()`… Esto solo traduce lo que
 * devuelven a tipos de dominio. Funciona igual con el cliente de una persona con cuenta que con el de la tablet
 * del local (`device-client.ts`): las lecturas de la tablet entran por su puerta con el PIN de un Encargado o
 * un Propietario.
 *
 * Toda lectura enumera sus columnas: estas tablas tienen privilegios de columna y `select *` devuelve 403
 * (CLAUDE.md). El PIN ni su HMAC salen nunca de la base de datos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type PersonRole = "owner" | "manager" | "staff";

export interface Person {
  /** `member`: Propietario o Encargado con cuenta (entra con su email). `staff`: el Equipo sin cuenta (entra con su PIN). */
  readonly kind: "member" | "staff";
  /** El identificador de la persona (`user_id` de un `member`, `id` de la fila del Equipo de un `staff`). */
  readonly id: string;
  readonly name: string;
  readonly role: PersonRole;
  readonly hasPin: boolean;
}

function isRole(value: string): value is PersonRole {
  return value === "owner" || value === "manager" || value === "staff";
}

export async function loadPeople(client: Client, establishmentId: string): Promise<readonly Person[]> {
  const { data, error } = await client.rpc("reservation_people", { p_establishment_id: establishmentId });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) =>
    (row.kind === "member" || row.kind === "staff") && isRole(row.role)
      ? [{ kind: row.kind, id: row.ref_id, name: row.name, role: row.role, hasPin: row.has_pin } satisfies Person]
      : [],
  );
}

export interface DeviceRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
}

/** Los dispositivos del local que siguen activos. Sin el hash del token ni quién los activó (no se leen). */
export async function loadDevices(client: Client, establishmentId: string): Promise<readonly DeviceRecord[]> {
  const { data, error } = await client
    .from("reservation_devices")
    .select("id, name, created_at, last_used_at")
    .eq("establishment_id", establishmentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
  }));
}

/** Los resultados de negocio del Equipo: vuelven como resultado, no como excepción. */
export type TeamOutcome = "created" | "done" | "unchanged" | "pin_in_use" | "pin_probes_locked";

function outcomeOf(value: Json): TeamOutcome {
  const outcome = typeof value === "object" && value !== null && !Array.isArray(value) ? value.outcome : undefined;
  if (outcome === "created" || outcome === "done" || outcome === "unchanged" || outcome === "pin_in_use" || outcome === "pin_probes_locked") return outcome;
  throw new Error("Respuesta no válida del servidor");
}

async function call(client: Client, run: () => PromiseLike<{ data: Json | null; error: { message: string } | null }>): Promise<TeamOutcome> {
  const { data, error } = await run();
  if (error) throw new Error(error.message);
  return outcomeOf(data);
}

export function addStaff(
  client: Client,
  a: { readonly establishmentId: string; readonly name: string; readonly pinHmac: string; readonly idempotencyKey: string | null },
): Promise<TeamOutcome> {
  return call(client, () =>
    client.rpc("add_reservation_staff", {
      p_establishment_id: a.establishmentId,
      p_name: a.name,
      p_pin_hmac: a.pinHmac,
      p_idempotency_key: a.idempotencyKey,
    }),
  );
}

export function setStaffPin(
  client: Client,
  a: { readonly establishmentId: string; readonly staffId: string; readonly pinHmac: string },
): Promise<TeamOutcome> {
  return call(client, () =>
    client.rpc("set_reservation_staff_pin", { p_establishment_id: a.establishmentId, p_staff_id: a.staffId, p_pin_hmac: a.pinHmac }),
  );
}

export function removeStaff(client: Client, a: { readonly establishmentId: string; readonly staffId: string }): Promise<TeamOutcome> {
  return call(client, () => client.rpc("remove_reservation_staff", { p_establishment_id: a.establishmentId, p_staff_id: a.staffId }));
}

export function setMyPin(client: Client, a: { readonly establishmentId: string; readonly pinHmac: string }): Promise<TeamOutcome> {
  return call(client, () => client.rpc("set_my_reservation_pin", { p_establishment_id: a.establishmentId, p_pin_hmac: a.pinHmac }));
}

export function revokeDevice(client: Client, a: { readonly establishmentId: string; readonly deviceId: string }): Promise<TeamOutcome> {
  return call(client, () => client.rpc("revoke_reservation_device", { p_establishment_id: a.establishmentId, p_device_id: a.deviceId }));
}

export interface HistoryEntry {
  readonly at: Date;
  /** La clave de auditoría (`reservations.staff_added`…) o `reservations.support_session`. */
  readonly kind: string;
  /** Quién lo hizo, ya como se le enseña al restaurante: su nombre, «Restavor» o «Restavor (soporte)». */
  readonly actorLabel: string;
  readonly detail: Readonly<Record<string, Json | undefined>>;
}

export async function loadHistory(client: Client, establishmentId: string, limit = 100): Promise<readonly HistoryEntry[]> {
  const { data, error } = await client.rpc("reservation_history_log", { p_establishment_id: establishmentId, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    at: new Date(row.at),
    kind: row.kind,
    actorLabel: row.actor_label,
    detail: typeof row.detail === "object" && row.detail !== null && !Array.isArray(row.detail) ? row.detail : {},
  }));
}
