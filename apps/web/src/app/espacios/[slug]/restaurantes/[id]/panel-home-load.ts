import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConversationMessage } from "@/components/conversation/Conversation";
import type { PanelAttention, PanelHomeData } from "@/components/panel/PanelHome";
import { PANEL_ROUTES, type ShellRole } from "@/components/shell/navigation";
import { todayInTimeZone } from "@/core/finance";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import type { Database } from "@/lib/supabase/database.types";

type CategoryKey = keyof typeof es.naming.categories;
type RequestStateKey = keyof typeof es.naming.states.request;
type MenuStateKey = keyof typeof es.naming.states.menu;

/** Lo que el panel ya ha leído para su pantalla y el Inicio reutiliza. */
export type PanelHomeInput = {
  readonly slug: string;
  readonly establishmentId: string;
  readonly userId: string;
  readonly role: ShellRole;
  readonly establishment: { readonly name: string; readonly code: string; readonly city: string | null };
  readonly photoUrl: string | null;
  readonly requests: readonly {
    readonly id: string;
    readonly code: string;
    readonly description: string;
    readonly state: string;
    readonly created_at: string;
  }[];
  readonly files: readonly { readonly id: string; readonly name: string; readonly created_at: string }[];
  readonly messages: readonly ConversationMessage[];
  readonly allowance: readonly { readonly category: string; readonly included: number; readonly remaining: number; readonly renews_at: string }[];
  readonly planNames: readonly string[];
  readonly timeZone: string;
};

/** Lo que espera una respuesta del restaurante (RN-REQ): aceptar, o contestar. */
const WAITING_FOR_CLIENT = new Set(["pending_client_acceptance", "needs_information"]);

/** Lo que el equipo tiene entre manos. */
const IN_PROGRESS = new Set(["accepted", "in_progress", "correction_requested", "in_correction"]);

/** Un menú que va de camino a publicarse. */
const MENU_ON_ITS_WAY = new Set([
  "publication_requested",
  "pending_assignment",
  "assigned",
  "needs_information",
  "reviewing",
  "ready_to_publish",
]);

/**
 * R01 a R04 · los datos del Inicio del panel. Cada consulta va con la
 * sesión de quien mira, así que lo que llega es lo que su RLS le deja ver;
 * lo que no se puede leer se queda fuera, nunca se rellena.
 */
export async function loadPanelHome(
  supabase: SupabaseClient<Database>,
  input: PanelHomeInput,
): Promise<PanelHomeData> {
  const base = `/espacios/${input.slug}/restaurantes/${input.establishmentId}`;
  const conMenu = input.role === "client_daily_menu";
  const fecha = (iso: string) => enZona(iso, input.timeZone, { day: "numeric", month: "short", year: "numeric" });
  const fechaDia = (dia: string) => fecha(`${dia}T12:00:00Z`);

  const [{ data: perfil }, menus, cobro] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", input.userId).maybeSingle(),
    conMenu ? loadUpcomingMenus(supabase, input.establishmentId, todayInTimeZone(new Date(), input.timeZone)) : Promise.resolve([]),
    loadNextCharge(supabase, input.establishmentId),
  ]);

  const firstName = (perfil?.full_name ?? "").trim().split(/\s+/)[0] ?? "";

  // Las tarjetas de arriba, por orden de urgencia.
  const attention: PanelAttention[] = [];
  const esperan = input.requests.filter((r) => WAITING_FOR_CLIENT.has(r.state));
  if (esperan.length > 0) {
    attention.push({
      kind: "request",
      count: esperan.length,
      href: `${base}/solicitudes/${esperan[0].id}`,
    });
  }
  const menuEnCamino = menus.find((m) => MENU_ON_ITS_WAY.has(m.state));
  if (menuEnCamino) {
    attention.push({
      kind: "menu",
      menuName: menuEnCamino.name,
      dateLabel: fechaDia(menuEnCamino.target_date),
      href: `${base}/menu-diario/${menuEnCamino.id}`,
    });
  }
  if (cobro !== null) {
    attention.push({
      kind: "charge",
      overdue: cobro.status === "overdue",
      concept: cobro.concept,
      dateLabel: fecha(cobro.due_at),
      href: `${base}/facturacion`,
    });
  } else {
    // R02 · quien no ve los pagos tiene en su lugar los mensajes, cuando
    // el último es del equipo y todavía no lo ha contestado.
    const ultimo = input.messages.at(-1);
    if (ultimo !== undefined && !ultimo.isMine) {
      attention.push({ kind: "messages", href: `${base}${PANEL_ROUTES.messages}` });
    }
  }

  const proximo = menus.find((m) => m.state !== "cancelled") ?? null;

  const activity = [
    ...input.requests.map((r) => ({
      id: `r-${r.id}`,
      at: r.created_at,
      icon: "request" as const,
      title: es.panelHome.activityRequestSent,
      detail: r.description,
      href: `${base}/solicitudes/${r.id}`,
    })),
    ...input.files.map((f) => ({
      id: `f-${f.id}`,
      at: f.created_at,
      icon: "document" as const,
      title: es.panelHome.activityFileShared,
      detail: f.name,
      href: `/api/archivos/${f.id}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3)
    .map(({ at, ...resto }) => ({ ...resto, dateLabel: fecha(at) }));

  return {
    firstName,
    establishment: { ...input.establishment, photoUrl: input.photoUrl },
    links: {
      newRequest: `${base}${PANEL_ROUTES.newRequest}`,
      createMenu: conMenu ? `${base}/menu-diario` : null,
      plan: `${base}/plan`,
      menus: conMenu ? `${base}/menu-diario` : null,
      messages: `${base}${PANEL_ROUTES.messages}`,
      requests: `${base}${PANEL_ROUTES.requests}`,
      data: `${base}/datos`,
      activity: `${base}/actividad`,
    },
    attention,
    plan: {
      names: input.planNames,
      quotas: input.allowance.map((linea) => ({
        label: es.naming.categories[linea.category as CategoryKey] ?? linea.category,
        used: Math.max(0, linea.included - linea.remaining),
        included: linea.included,
      })),
      renewsLabel: input.allowance.length > 0 ? fecha(input.allowance[0].renews_at) : null,
    },
    showMenus: conMenu,
    nextMenu:
      proximo === null
        ? null
        : {
            name: proximo.name,
            stateLabel: es.naming.states.menu[proximo.state as MenuStateKey] ?? proximo.state,
            dateLabel: fechaDia(proximo.target_date),
            href: `${base}/menu-diario/${proximo.id}`,
          },
    // P7 · `senderDisplay` es "Equipo de mantenimiento" para el equipo: el
    // restaurante nunca ve un nombre suyo.
    messages: [...input.messages]
      .reverse()
      .slice(0, 3)
      .map((m) => ({
        id: m.id,
        from: m.isMine ? es.panelHome.messageFromYou : m.senderDisplay,
        body: m.body,
        dateLabel: fecha(m.createdAt),
      })),
    activity,
    inProgress: input.requests
      .filter((r) => IN_PROGRESS.has(r.state))
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        title: r.description,
        stateLabel: es.naming.states.request[r.state as RequestStateKey] ?? r.state,
        dateLabel: fecha(r.created_at),
        href: `${base}/solicitudes/${r.id}`,
      })),
    firstSteps: input.requests.length === 0,
  };
}

/** Los menús de hoy en adelante, el más cercano primero. */
async function loadUpcomingMenus(
  supabase: SupabaseClient<Database>,
  establishmentId: string,
  today: string,
): Promise<{ id: string; name: string; state: string; target_date: string }[]> {
  const { data } = await supabase
    .from("menus")
    .select("id, name, state, target_date")
    .eq("establishment_id", establishmentId)
    .gte("target_date", today)
    .order("target_date", { ascending: true })
    .limit(10);
  return data ?? [];
}

/**
 * El cobro vivo más cercano. Solo para quien puede ver los pagos
 * (`client_can_view_billing()`, RN-FIN-07); el estado lo deriva el
 * servidor (`charge_status()`), aquí no se suma dinero.
 */
async function loadNextCharge(
  supabase: SupabaseClient<Database>,
  establishmentId: string,
): Promise<{ concept: string; due_at: string; status: string } | null> {
  const { data: puede } = await supabase.rpc("client_can_view_billing", { p_establishment_id: establishmentId });
  if (puede !== true) return null;
  const { data: cargos } = await supabase
    .from("charges")
    .select("id, concept, due_at")
    .eq("establishment_id", establishmentId)
    .order("due_at", { ascending: true })
    .limit(20);
  for (const cargo of cargos ?? []) {
    const { data: estado } = await supabase.rpc("charge_status", { p_charge_id: cargo.id });
    if (estado === "pending" || estado === "overdue" || estado === "partially_paid") {
      return { concept: cargo.concept, due_at: cargo.due_at, status: estado };
    }
  }
  return null;
}
