import { redirect } from "next/navigation";

import { AppShell, type ShellNotification } from "@/components/shell/AppShell";
import { totalUnread } from "@/core/global-home";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { avatarLink } from "@/services/avatar-storage";
import { myConversations } from "@/services/global-gateway";

import { searchEverything } from "../espacios/[slug]/shell-actions";
import { loadProductAccess } from "../product-access";

/**
 * Restavor agents · el armazón (decisión 89). En la Fase A solo existe la
 * página mínima `/agents`; Hoy, Calendario, Agente de llamadas y Saldo llegan
 * en la Fase B. Es el mismo armazón que el resto de la aplicación con la marca
 * "Restavor agents" y el cambio de producto desde el logo.
 *
 * El armazón no autoriza nada: qué reservas ve cada persona lo deciden RLS y
 * las funciones del servidor.
 */
export const dynamic = "force-dynamic";

type EventKey = keyof typeof es.notifications.events;

export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [conversaciones, { data: rows }, { profile, userAvatarUrl }, productAccess] =
    await Promise.all([
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
