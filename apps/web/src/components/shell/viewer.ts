import { createClient } from "@/lib/supabase/server";

import type { ShellRole } from "./navigation";

/**
 * Quién está mirando: su rol en el espacio y, si es un restaurante, cuál
 * es el suyo. Es lo que necesita la navegación para saber qué destinos
 * pintar.
 *
 * Vive aquí y no dentro del layout porque lo usan dos sitios —el layout,
 * que monta el armazón, y la pantalla "Más" de §20.3, que enseña los
 * destinos que no caben en la barra— y las dos tienen que responder
 * exactamente lo mismo. Dos copias de "qué rol tiene esta persona" es de
 * las cosas que se desfasan sin que nadie lo note (salvedad 18 del
 * ROADMAP, tres listas de estados que llevaban meses discrepando).
 *
 * **No autoriza nada.** Decide qué se pinta; quién puede entrar en cada
 * destino lo siguen decidiendo RLS y las funciones del servidor
 * (CLAUDE.md: ocultar un botón no es un control de acceso).
 */
export type ShellViewer = {
  readonly userId: string;
  readonly spaceId: string | null;
  readonly role: ShellRole;
  readonly establishmentId: string | null;
};

export async function resolveShellViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  slug: string,
): Promise<ShellViewer> {
  const { data: space } = await supabase
    .from("spaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  // Un cliente no puede leer `spaces` —no es miembro del espacio— pero sí
  // sus restaurantes. Sin espacio legible se sigue adelante: negarle la
  // navegación por eso lo dejaría sin salida en sus propias pantallas.
  const spaceId = space?.id ?? null;

  const { data: membership } = spaceId
    ? await supabase
        .from("space_memberships")
        .select("role")
        .eq("space_id", spaceId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  const role: ShellRole = (membership?.role as ShellRole | undefined) ?? "client";

  // Para un cliente los destinos cuelgan de su restaurante, y solo se sabe
  // cuál si tiene exactamente uno: con varios, la navegación lo manda al
  // selector de contexto, que es donde elige.
  let establishmentId: string | null = null;
  if (role === "client") {
    const { data: mine } = await supabase.from("establishments").select("id").limit(2);
    if (mine && mine.length === 1) {
      establishmentId = mine[0].id;
    }
  }

  return { userId, spaceId, role, establishmentId };
}
