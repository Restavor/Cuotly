"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";

export type ActionState = {
  error: string | null;
  message?: string | null;
  inviteToken?: string | null;
};

const emptyState: ActionState = { error: null };

/**
 * Dispara la semilla del espacio de Restavor (create_restavor_space en la
 * base de datos). Toda la comprobación de "¿eres el propietario de
 * Cuotly?" y toda la creación ocurren en una única transacción dentro de
 * esa función — aquí solo se llama y se traduce el resultado.
 */
export async function createRestavorSpace(): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_restavor_space");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  redirect(`/espacios/restavor`);
  return { ...emptyState, message: data ?? null };
}

/**
 * Invita a alguien al equipo (HU-03, HU-04). Si el correo ya está
 * registrado en Cuotly, se le añade directamente al espacio (PRD §7.4:
 * "Añadir al espacio"); si no, se crea una invitación con caducidad de
 * 7 días — el envío por correo llega cuando exista Resend, mientras
 * tanto se devuelve el enlace para compartirlo a mano
 * (docs/PLAN-H1-H2.md, decisión 4).
 */
export async function inviteMember(
  spaceId: string,
  spaceSlug: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");

  if (!email || (role !== "admin" && role !== "worker")) {
    return { error: es.actions.inviteValidation };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: es.actions.notAuthenticated };
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { error: membershipError } = await supabase.from("space_memberships").insert({
      space_id: spaceId,
      user_id: existingProfile.id,
      role,
      status: "active",
    });

    if (membershipError) {
      return { error: membershipError.message };
    }

    revalidatePath(`/espacios/${spaceSlug}`);
    return { ...emptyState, message: "already_registered" };
  }

  const { data: invitation, error: invitationError } = await supabase
    .from("space_invitations")
    .insert({ space_id: spaceId, email, role, invited_by: user.id })
    .select("token")
    .single();

  if (invitationError) {
    return { error: invitationError.message };
  }

  revalidatePath(`/espacios/${spaceSlug}`);
  return { ...emptyState, inviteToken: invitation.token };
}
