/**
 * Lo que lee la prueba en seco, y solo lectura (la puerta `read-only-gate.ts` lo impide si algún día se intentara otra cosa).
 * Cada fila se valida: no se da por buena la forma de lo que devuelve la base. Un error de lectura NUNCA se confunde con una cola vacía.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuInfo, QueueItem, RestaurantInfo } from "../core/dry-run.ts";
import { err, ok, type Result } from "../core/result.ts";
import { ReadOnlyViolation } from "./read-only-gate.ts";

export type ReadError = { step: string; message: string; blocked: boolean };

type Row = Record<string, unknown>;

class BadRow extends Error {}

function str(row: Row, key: string): string {
  const v = row[key];
  if (typeof v !== "string") throw new BadRow(`la columna ${key} no es un texto`);
  return v;
}
function strOrNull(row: Row, key: string): string | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new BadRow(`la columna ${key} no es un texto`);
  return v;
}
function bool(row: Row, key: string): boolean {
  const v = row[key];
  if (typeof v !== "boolean") throw new BadRow(`la columna ${key} no es verdadero o falso`);
  return v;
}
function dateOrNull(row: Row, key: string): Date | null {
  const v = strOrNull(row, key);
  if (v === null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRow(`la columna ${key} no es una fecha`);
  return d;
}
function rowsOf(data: unknown): Row[] {
  if (!Array.isArray(data)) throw new BadRow("la respuesta no es una lista de filas");
  return data as Row[];
}

async function step<T>(name: string, run: () => Promise<T>): Promise<Result<T, ReadError>> {
  try {
    return ok(await run());
  } catch (e) {
    if (e instanceof ReadOnlyViolation) return err({ step: name, message: e.message, blocked: true });
    if (e instanceof BadRow) return err({ step: name, message: e.message, blocked: false });
    return err({ step: name, message: e instanceof Error ? e.message : "error desconocido", blocked: false });
  }
}

/** Lanza si Supabase devolvió un error (el mensaje de Supabase no lleva contraseñas ni claves). */
function failOn(error: { message: string } | null): void {
  if (error !== null) throw new Error(error.message);
}

export type Surroundings = {
  authorizedIds: ReadonlySet<string>;
  restaurants: RestaurantInfo[];
  /** `spaces.timezone` por id de espacio. */
  timeZones: Map<string, string>;
};

/** Paso 1: en qué restaurantes está autorizado el agente, sus fichas y la zona horaria de sus espacios. */
export async function readSurroundings(client: SupabaseClient, agentUserId: string): Promise<Result<Surroundings, ReadError>> {
  const authorized = await step("las autorizaciones del agente (worker_establishments)", async () => {
    const { data, error } = await client
      .from("worker_establishments")
      .select("establishment_id,user_id,revoked_at")
      .eq("user_id", agentUserId)
      .is("revoked_at", null);
    failOn(error);
    return new Set(rowsOf(data).map((r) => str(r, "establishment_id")));
  });
  if (!authorized.ok) return err(authorized.error);
  if (authorized.value.size === 0) return ok({ authorizedIds: authorized.value, restaurants: [], timeZones: new Map() });

  const restaurants = await step("los restaurantes (establishments)", async () => {
    const { data, error } = await client
      .from("establishments")
      .select("id,space_id,code,name,status,web_platform,website_url,permanently_deleted_at")
      .in("id", [...authorized.value]);
    failOn(error);
    return rowsOf(data).map(
      (r): RestaurantInfo => ({
        id: str(r, "id"),
        spaceId: str(r, "space_id"),
        code: str(r, "code"),
        name: str(r, "name"),
        status: str(r, "status"),
        webPlatform: strOrNull(r, "web_platform"),
        websiteUrl: strOrNull(r, "website_url"),
        permanentlyDeleted: strOrNull(r, "permanently_deleted_at") !== null,
      }),
    );
  });
  if (!restaurants.ok) return err(restaurants.error);

  const spaceIds = [...new Set(restaurants.value.map((r) => r.spaceId))];
  const timeZones = new Map<string, string>();
  if (spaceIds.length > 0) {
    const spaces = await step("los espacios (spaces)", async () => {
      const { data, error } = await client.from("spaces").select("id,slug,timezone").in("id", spaceIds);
      failOn(error);
      for (const r of rowsOf(data)) timeZones.set(str(r, "id"), str(r, "timezone"));
    });
    if (!spaces.ok) return err(spaces.error);
  }
  return ok({ authorizedIds: authorized.value, restaurants: restaurants.value, timeZones });
}

/** Paso 2: la cola (menús con publicación viva) de cada espacio con restaurantes activados, y los menús de esos restaurantes. */
export async function readQueueAndMenus(
  client: SupabaseClient,
  activated: { spaceIds: readonly string[]; establishmentIds: readonly string[] },
): Promise<Result<{ queue: QueueItem[]; menus: MenuInfo[] }, ReadError>> {
  const queue: QueueItem[] = [];
  for (const spaceId of activated.spaceIds) {
    const q = await step("la cola de menús (team_menu_queue)", async () => {
      const { data, error } = await client.rpc("team_menu_queue", { p_space_id: spaceId }, { get: true });
      failOn(error);
      return rowsOf(data).map(
        (r): QueueItem => ({
          menuId: str(r, "menu_id"),
          publicationId: strOrNull(r, "publication_id"),
          establishmentId: str(r, "establishment_id"),
          establishmentName: str(r, "establishment_name"),
          name: str(r, "name"),
          kind: str(r, "kind"),
          targetDate: str(r, "target_date"),
          state: str(r, "state"),
          requestedAt: dateOrNull(r, "requested_at"),
          publishByAt: dateOrNull(r, "publish_by_at"),
          isAssigned: bool(r, "is_assigned"),
          assignedTo: strOrNull(r, "assigned_to"),
          assignmentMode: strOrNull(r, "assignment_mode"),
        }),
      );
    });
    if (!q.ok) return err(q.error);
    queue.push(...q.value.filter((item) => activated.establishmentIds.includes(item.establishmentId)));
  }

  let menus: MenuInfo[] = [];
  if (activated.establishmentIds.length > 0) {
    const m = await step("los menús (menus)", async () => {
      const { data, error } = await client
        .from("menus")
        .select("id,establishment_id,kind,name,target_date,state,published_at")
        .in("establishment_id", [...activated.establishmentIds])
        .neq("state", "cancelled");
      failOn(error);
      return rowsOf(data).map(
        (r): MenuInfo => ({
          id: str(r, "id"),
          establishmentId: str(r, "establishment_id"),
          kind: str(r, "kind"),
          name: str(r, "name"),
          targetDate: str(r, "target_date"),
          state: str(r, "state"),
          publishedAt: dateOrNull(r, "published_at"),
        }),
      );
    });
    if (!m.ok) return err(m.error);
    menus = m.value;
  }
  return ok({ queue, menus });
}
