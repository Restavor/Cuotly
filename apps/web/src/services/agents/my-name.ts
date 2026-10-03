/**
 * `src/services/agents/my-name.ts` · quién es la persona con cuenta que mira Restavor agents: su identificador y el
 * nombre con el que se le saluda («La creas tú · José García»).
 *
 * Es siempre de la **sesión de una persona**: nunca se llama desde una tablet del local (que no es nadie en concreto: su
 * «quién» es el PIN de cada acción). Por eso vive aparte de las lecturas de la agenda, que sí pueden correr con el
 * cliente de una tablet y que `lecturas-acotadas.test.ts` vigila una a una.
 */
import { createClient } from "@/lib/supabase/server";

export async function myUserId(): Promise<string | null> {
  const supabase = await createClient();
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

export async function myDisplayName(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "";
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", data.user.id).maybeSingle();
  return profile?.full_name?.trim() || profile?.email || "";
}
