import { redirect } from "next/navigation";

import { AppShell, type ShellNotification } from "@/components/shell/AppShell";
import type { AgentsNavContext } from "@/components/shell/navigation";
import { totalUnread } from "@/core/global-home";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { avatarLink } from "@/services/avatar-storage";
import { myConversations } from "@/services/global-gateway";

import { searchEverything } from "../espacios/[slug]/shell-actions";
import { loadProductAccess } from "../product-access";

type EventKey = keyof typeof es.notifications.events;

/**
 * Restavor agents · el armazón (decisión 89, PRD de agents §5.1). Es el mismo armazón que
 * el resto de la aplicación con la marca «Restavor agents» y el cambio de producto desde
 * el logo. Con `nav` —el restaurante en el que se está y quién es quien mira—, el menú es
 * el de §5.1; sin él (el selector de `/agents`), el mínimo de la Fase A.
 *
 * El armazón no autoriza nada: qué reservas ve cada persona lo deciden RLS y las
 * funciones del servidor.
 */
export async function AgentsShell({
  nav,
  children,
}: {
  nav?: AgentsNavContext | null;
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [conversaciones, { data: rows }, { profile, userAvatarUrl }, productAccess] = await Promise.all([
    myConversations(supabase).catch(() => null),
    supabase
      .from("notifications")
      .select("id, event_type, deep_link, read_at")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("profiles")
      .select("full_name, email, avatar_path")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data }) => ({
        profile: data,
        userAvatarUrl: await avatarLink(supabase.storage, data?.avatar_path ?? null),
      })),
    loadProductAccess(supabase),
  ]);

  const userLabel = profile?.full_name?.trim() || profile?.email || user.email || "";
  const userInitial = (userLabel.trim()[0] ?? "·").toUpperCase();

  const notifications: ShellNotification[] = (rows ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type as EventKey,
    deepLink: row.deep_link,
    readAt: row.read_at,
  }));

  return (
    <AppShell
      context="agents"
      agentsNav={nav ?? null}
      userInitial={userInitial}
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      productAccess={productAccess}
      notifications={notifications}
      unreadMessages={conversaciones === null ? 0 : totalUnread(conversaciones)}
      onSearch={searchEverything}
    >
      {children}
    </AppShell>
  );
}
