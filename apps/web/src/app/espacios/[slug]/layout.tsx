import { notFound, redirect } from "next/navigation";

import { AppShell, type ShellNotification } from "@/components/shell/AppShell";
import type { ShellRole } from "@/components/shell/navigation";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { searchEverything } from "./shell-actions";

/**
 * El armazón de §20.2, §20.3 y §20.5 envolviendo las pantallas de verdad.
 *
 * Hasta ahora existía y se probaba contra `/armazon`, una página de
 * demostración sin datos: los cuatro criterios de experiencia (CA-19 a
 * CA-22) estaban comprobados sobre un maniquí. Esto los pone sobre el
 * producto.
 *
 * El rol que se le pasa al armazón sale de la membresía real del espacio,
 * no de nada que mande el navegador. Y no autoriza nada: decide qué
 * destinos se pintan, mientras que quién puede entrar en cada uno lo
 * siguen decidiendo RLS y las funciones del servidor (CLAUDE.md: ocultar
 * un botón no es un control de acceso).
 */
export const dynamic = "force-dynamic";

type EventKey = keyof typeof es.notifications.events;

export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  // Un cliente no puede leer `spaces` —no es miembro del espacio— pero sí
  // sus restaurantes. Sin espacio legible seguimos adelante con el nombre
  // que ya trae la URL: negarle el armazón entero por eso lo dejaría sin
  // navegación en sus propias pantallas.
  const spaceId = space?.id ?? null;

  const { data: membership } = spaceId
    ? await supabase
        .from("space_memberships")
        .select("role")
        .eq("space_id", spaceId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  const role: ShellRole = (membership?.role as ShellRole | undefined) ?? "client";

  // Para un cliente, los destinos del armazón cuelgan de su restaurante.
  // Solo se puede saber cuál si tiene exactamente uno: con varios, la
  // navegación lo manda al selector de contexto, que es donde elige.
  let establishmentId: string | null = null;
  if (role === "client") {
    const { data: mine } = await supabase.from("establishments").select("id").limit(2);
    if (mine && mine.length === 1) {
      establishmentId = mine[0].id;
    }
  }

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, event_type, deep_link, read_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const notifications: ShellNotification[] = (rows ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type as EventKey,
    deepLink: row.deep_link,
    readAt: row.read_at,
  }));

  if (!space && role !== "client") notFound();

  return (
    <AppShell
      spaceSlug={slug}
      spaceName={space?.name ?? slug}
      role={role}
      notifications={notifications}
      onSearch={searchEverything}
      establishmentId={establishmentId}
    >
      {children}
    </AppShell>
  );
}
