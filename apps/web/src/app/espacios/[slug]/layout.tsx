import { notFound, redirect } from "next/navigation";

import { AppShell, type ShellNotification } from "@/components/shell/AppShell";
import { resolveShellViewer } from "@/components/shell/viewer";
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

  // El rol y el restaurante salen de `resolveShellViewer()`, compartido con
  // la pantalla "Más": las dos tienen que responder lo mismo o la barra de
  // móvil y su desbordamiento acabarían discrepando.
  const { role, establishmentId } = await resolveShellViewer(supabase, user.id, slug);

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
