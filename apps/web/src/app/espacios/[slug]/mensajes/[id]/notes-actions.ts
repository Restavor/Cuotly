"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type NoteState = { error: string | null; saved: boolean };

/**
 * Escribir una nota interna (RN-EST-13, maqueta 18).
 *
 * Quién puede escribirla y quién puede reservarla al propietario y a los
 * administradores lo comprueba `create_establishment_note()` por su
 * cuenta. Esta acción solo traduce el error: ocultar el formulario no es
 * un control de acceso (CLAUDE.md).
 */
export async function createNote(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  // El interruptor llega como "on" o no llega. Ausente = operativa, que es
  // como nace una nota (RN-EST-13).
  const restricted = formData.get("restricted") !== null;

  if (!body) return { error: null, saved: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_establishment_note", {
    p_establishment_id: establishmentId,
    p_body: body,
    p_operational: !restricted,
  });

  if (error) return { error: error.message, saved: false };

  revalidatePath("/espacios", "layout");
  return { error: null, saved: true };
}

/**
 * Archivar una nota. No hay borrar: la nota deja de listarse y sigue
 * estando (CLAUDE.md).
 */
export async function archiveNote(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const noteId = String(formData.get("noteId") ?? "");
  if (!noteId) return { error: null, saved: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_establishment_note", {
    p_note_id: noteId,
    p_reason: String(formData.get("reason") ?? "").trim() || undefined,
  });

  if (error) return { error: error.message, saved: false };

  revalidatePath("/espacios", "layout");
  return { error: null, saved: true };
}
