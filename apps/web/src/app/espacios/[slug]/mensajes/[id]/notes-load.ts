import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Las notas internas de un restaurante (RN-EST-13, maqueta 18).
 *
 * **Aquí no se filtra nada.** Qué notas llegan lo decide
 * `establishment_notes_select`: propietario y administradores ven las dos
 * clases, el trabajador autorizado solo las operativas, y el cliente no ve
 * ninguna — ni siquiera las operativas. Escribir ese filtro otra vez en
 * TypeScript sería una segunda copia de la regla, y dos copias acaban
 * discrepando (CLAUDE.md).
 *
 * `canRead` no es un permiso: es la respuesta del servidor a "¿tiene esta
 * persona algo que ver con las notas de este restaurante?". Sirve para no
 * pintarle al cliente un panel vacío que le haría preguntarse qué se está
 * perdiendo — RN-MSG-04 pide separación estricta, y una caja vacía titulada
 * "Notas internas" ya cuenta algo.
 */
export interface EstablishmentNote {
  readonly id: string;
  readonly body: string;
  readonly operational: boolean;
  readonly authorName: string | null;
  readonly createdAt: string;
  readonly mine: boolean;
}

export interface EstablishmentNotes {
  readonly canRead: boolean;
  /** Si quien mira puede reservar una nota al propietario y administradores. */
  readonly canRestrict: boolean;
  readonly notes: readonly EstablishmentNote[];
}

export async function loadEstablishmentNotes(
  supabase: SupabaseClient<Database>,
  establishmentId: string,
  spaceId: string,
  userId: string,
): Promise<EstablishmentNotes> {
  const [{ data: canRead }, { data: canRestrict }] = await Promise.all([
    supabase.rpc("can_read_establishment_notes", { p_establishment_id: establishmentId }),
    supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "manage_clients" }),
  ]);

  if (canRead !== true) return { canRead: false, canRestrict: false, notes: [] };

  // Las archivadas no se listan: siguen estando (CLAUDE.md no borra nada de
  // negocio), pero ya no son lo que alguien tiene que leer hoy.
  const { data } = await supabase
    .from("establishment_notes")
    .select("id, body, operational, created_by, created_at")
    .eq("establishment_id", establishmentId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const filas = data ?? [];
  const autores = [...new Set(filas.map((nota) => nota.created_by))];

  // El nombre de quien la escribió es del EQUIPO, y aquí se puede leer
  // porque comparten espacio (`profiles_select`). Al cliente no le llega
  // ninguna nota, así que esta identidad no viaja hacia él por esta vía.
  const { data: perfiles } = autores.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", autores)
    : { data: [] };

  const nombre = new Map(
    (perfiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]),
  );

  return {
    canRead: true,
    canRestrict: canRestrict === true,
    notes: filas.map((nota) => ({
      id: nota.id,
      body: nota.body,
      operational: nota.operational,
      authorName: nombre.get(nota.created_by) ?? null,
      createdAt: nota.created_at,
      mine: nota.created_by === userId,
    })),
  };
}
