import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase con la service role key: salta RLS por completo.
 * Solo para rutas de servidor de confianza que necesitan escribir algo
 * que ninguna política de RLS puede autorizar por sí sola porque
 * depende de un hecho que ocurrió fuera de la base de datos — el caso
 * de origen es `record_classification` (Hito 4, auditoría posterior a
 * `20260830000017`): grabar qué propuso realmente la IA no puede
 * depender de lo que el propio cliente afirme haber recibido, así que
 * esa función solo la puede ejecutar `service_role` (ver
 * `supabase/migrations/20260830000018_hito4_audit_fixes.sql`), nunca la
 * sesión del usuario.
 *
 * `.env.example` ya avisaba de esto desde el Hito 2: "la service role
 * key... solo se usa en el servidor, en un lugar que ya veremos cuando
 * haga falta" — este es ese lugar.
 *
 * NUNCA se importa desde un componente cliente ni desde código que
 * pueda acabar en el bundle del navegador — `SUPABASE_SERVICE_ROLE_KEY`
 * (sin el prefijo `NEXT_PUBLIC_`, a propósito) solo existe en el
 * entorno del servidor.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
