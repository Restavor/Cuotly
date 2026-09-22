import { createClient } from "@/lib/supabase/server";

/** Si quien mira ha entrado. Solo decide qué botones pintar, nunca qué se ve. */
export async function hasSession(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}
