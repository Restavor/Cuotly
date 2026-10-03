import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell, type ShellNotification } from "@/components/shell/AppShell";
import type { AgentsNavContext } from "@/components/shell/navigation";
import { Icon } from "@/components/ui/Icon";
import { totalUnread } from "@/core/global-home";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { avatarLink } from "@/services/avatar-storage";
import { myConversations } from "@/services/global-gateway";

import { searchEverything } from "../espacios/[slug]/shell-actions";
import { loadProductAccess } from "../product-access";
import { DeviceGateProvider } from "./_components/DeviceGate";
import { ElevationBar } from "./_components/ElevationBar";
import { SupportBar } from "./_components/SupportBar";
import { noSearchAction } from "./device-actions";

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
  // La tablet del local no es una persona con cuenta (PRD de agents §3.3): sin avisos, sin mensajes, sin «Mi cuenta» ni
  // cambio de producto. Entra por su dispositivo, y cada acción que cambia algo pide «¿Quién eres?» + PIN.
  if (nav && nav.deviceName != null) {
    const todayHref = agentsPageHref(nav.establishmentId, "today");
    return (
      <AppShell
        context="agents"
        agentsNav={nav}
        userInitial={(nav.deviceName.trim()[0] ?? "T").toUpperCase()}
        userAvatarUrl={null}
        userLabel={nav.deviceName}
        productAccess={null}
        notifications={[]}
        unreadMessages={0}
        onSearch={noSearchAction}
        agentsBanner={
          nav.elevation ? (
            <ElevationBar
              establishmentId={nav.establishmentId}
              name={nav.elevation.name}
              secondsLeft={nav.elevation.secondsLeft}
              todayHref={todayHref}
            />
          ) : null
        }
        agentsSidebarExtra={
          nav.elevation ? null : (
            <Link
              href={agentsPageHref(nav.establishmentId, "unlock")}
              data-testid="device-unlock-link"
              className="flex min-h-11 items-center gap-3 rounded-field px-3 text-sm font-medium text-sidebar-text hover:bg-sidebar-raised hover:text-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              <Icon name="lock" className="h-4 w-4 shrink-0" />
              {es.agents.device.unlock.link}
            </Link>
          )
        }
      >
        <DeviceGateProvider>{children}</DeviceGateProvider>
      </AppShell>
    );
  }

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
      agentsBanner={
        nav?.supportSession ? (
          <SupportBar restaurantName={nav.name} sessionId={nav.supportSession.id} expiresAt={nav.supportSession.expiresAt} />
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
