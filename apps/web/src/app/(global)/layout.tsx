import { redirect } from "next/navigation";

import { AppShell, type ShellNotification } from "@/components/shell/AppShell";
import { totalUnread } from "@/core/global-home";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { avatarLink } from "@/services/avatar-storage";
import { myConversations } from "@/services/global-gateway";

import { searchEverything } from "../espacios/[slug]/shell-actions";

/**
 * El armazón del contexto global (PRD §36, vistas G01 a G08): la zona de
 * Cuotly que ocurre **fuera de todo espacio y de todo panel**.
 *
 * Es **el mismo armazón** que el de un espacio, con otros destinos. Hasta
 * el 20/09/2026 era otro distinto —una tarjeta blanca con borde a la
 * izquierda, sin iconos, sin cabecera, sin buscador, sin campana y sin
 * avatar, dentro de un contenedor centrado—, y como desde la decisión 42
 * aquí entra todo el mundo al identificarse, **la primera pantalla que se
 * veía era la que menos se parecía al diseño**. El diseño enseña la misma
 * barra lateral verde en sus 157 vistas; tener dos armazones era la razón
 * de fondo por la que entrar en Cuotly no se parecía a la maqueta.
 *
 * Solo cuelgan de aquí las pantallas de §36. Los espacios
 * (`/espacios/...`), el panel de Administración y la página pública de
 * estado tienen su propio armazón: los dos primeros porque son otro
 * contexto con otros destinos, el último porque se ve sin sesión.
 *
 * El contador de no leídos se calcula aquí, una vez, y es el MISMO número
 * que enseña la bandeja: si se contara en cada sitio, tarde o temprano
 * dirían cosas distintas (RN-GLO-05, "reúne, no duplica").
 */
export const dynamic = "force-dynamic";

type EventKey = keyof typeof es.notifications.events;

export default async function GlobalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  /*
   * Si la bandeja no se puede leer, la barra sale sin número. Un cero sería
   * afirmar que no hay nada sin saberlo (CLAUDE.md, CA-20).
   */
  const [conversaciones, { data: rows }, { data: profile }] = await Promise.all([
    myConversations(supabase).catch(() => null),
    supabase
      .from("notifications")
      .select("id, event_type, deep_link, read_at")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("full_name, email, avatar_path").eq("id", user.id).maybeSingle(),
  ]);

  const userLabel = profile?.full_name?.trim() || profile?.email || user.email || "";
  const userInitial = (userLabel.trim()[0] ?? "·").toUpperCase();
  const userAvatarUrl = await avatarLink(supabase.storage, profile?.avatar_path ?? null);

  const notifications: ShellNotification[] = (rows ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type as EventKey,
    deepLink: row.deep_link,
    readAt: row.read_at,
  }));

  return (
    <AppShell
      context="global"
      userInitial={userInitial}
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      notifications={notifications}
      unreadMessages={conversaciones === null ? 0 : totalUnread(conversaciones)}
      onSearch={searchEverything}
    >
      {children}
    </AppShell>
  );
}
