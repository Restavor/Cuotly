import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClientCalendarEvent } from "@/core/client-calendar";
import { todayInTimeZone } from "@/core/finance";
import { isMenuState } from "@/core/menu-states";
import { requestHeadline } from "@/core/requests";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import type { Database } from "@/lib/supabase/database.types";

type RequestStateKey = keyof typeof es.naming.states.request;
const t = es.panelCalendar;

/**
 * R21 y R22 · los eventos del restaurante entre dos días (incluidos), en la
 * zona del espacio.
 *
 * `space_calendar()` no sirve aquí: lee `spaces` y `menu_publications`,
 * que no son del restaurante. Se derivan de lo que SÍ puede leer, cada
 * consulta con su sesión y filtrada por su RLS:
 *
 *   · menús (fecha objetivo) — solo los ve quien tiene Menú Diario;
 *   · solicitudes (el día en que se crearon);
 *   · la próxima renovación de su bolsa (`establishment_cycle_allowance()`)
 *     y la de Menú Diario (`menu_update_balance()`);
 *   · informes enviados (RN-REP-16 decide cuáles ve);
 *   · cobros que vencen, solo si `client_can_view_billing()` (RN-FIN-07).
 *
 * Lo que no puede leer no aparece, y no se rellena.
 */
export async function loadClientCalendar(
  supabase: SupabaseClient<Database>,
  input: { slug: string; establishmentId: string; timeZone: string; from: string; to: string },
): Promise<ClientCalendarEvent[]> {
  const { establishmentId: id, timeZone: tz, from, to } = input;
  const base = `/espacios/${input.slug}/restaurantes/${id}`;
  const dia = (iso: string) => todayInTimeZone(new Date(iso), tz);
  const hora = (iso: string) => enZona(iso, tz, { hour: "2-digit", minute: "2-digit" });
  // Un margen de un día a cada lado: un instante del día 1 en Madrid es
  // del día anterior en UTC, y se filtra otra vez por el día ya en zona.
  const desde = `${from}T00:00:00Z`;
  const hasta = new Date(new Date(`${to}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString();
  const antesDe = new Date(new Date(desde).getTime() - 86_400_000).toISOString();

  const [menus, requests, bolsas, menuBalance, reports, puedePagos] = await Promise.all([
    supabase
      .from("menus")
      .select("id, name, target_date, state")
      .eq("establishment_id", id)
      .gte("target_date", from)
      .lte("target_date", to),
    supabase
      .from("requests")
      .select("id, code, description, state, created_at")
      .eq("establishment_id", id)
      .gte("created_at", antesDe)
      .lt("created_at", hasta),
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: id }),
    supabase.rpc("menu_update_balance", { p_establishment_id: id }),
    supabase
      .from("reports")
      .select("id, name, sent_at")
      .eq("establishment_id", id)
      .not("sent_at", "is", null)
      .gte("sent_at", antesDe)
      .lt("sent_at", hasta),
    supabase.rpc("client_can_view_billing", { p_establishment_id: id }),
  ]);

  const eventos: ClientCalendarEvent[] = [];

  for (const m of menus.data ?? []) {
    eventos.push({
      id: `menu-${m.id}`,
      kind: "menu",
      day: m.target_date,
      time: null,
      title: t.menuPublication(m.name),
      detail: null,
      stateLabel: isMenuState(m.state) ? es.naming.states.menu[m.state] : m.state,
      href: `${base}/menu-diario/${m.id}`,
    });
  }

  for (const r of requests.data ?? []) {
    eventos.push({
      id: `request-${r.id}`,
      kind: "request",
      day: dia(r.created_at),
      time: hora(r.created_at),
      title: requestHeadline(r.description, 60) || r.code,
      detail: r.description,
      stateLabel: es.naming.states.request[r.state as RequestStateKey] ?? r.state,
      href: `${base}/solicitudes/${r.id}`,
    });
  }

  const renovacionPlan = bolsas.data?.[0]?.renews_at ?? null;
  if (renovacionPlan) {
    eventos.push({
      id: "renewal-plan",
      kind: "renewal",
      day: dia(renovacionPlan),
      time: null,
      title: t.planRenewal,
      detail: t.planRenewalDetail,
      stateLabel: null,
      href: `${base}/plan`,
    });
  }
  const finMenu = menuBalance.data?.[0]?.cycle_end ?? null;
  if (finMenu) {
    eventos.push({
      id: "renewal-menu",
      kind: "renewal",
      day: dia(finMenu),
      time: null,
      title: t.menuRenewal,
      detail: t.menuRenewalDetail,
      stateLabel: null,
      href: `${base}/menu-diario/servicio`,
    });
  }

  for (const rep of reports.data ?? []) {
    if (!rep.sent_at) continue;
    eventos.push({
      id: `report-${rep.id}`,
      kind: "report",
      day: dia(rep.sent_at),
      time: hora(rep.sent_at),
      title: t.reportSent(rep.name),
      detail: null,
      stateLabel: null,
      href: `/espacios/${input.slug}/informes/${rep.id}`,
    });
  }

  if (puedePagos.data === true) {
    const { data: cargos } = await supabase
      .from("charges")
      .select("id, concept, due_at")
      .eq("establishment_id", id)
      .gte("due_at", antesDe)
      .lt("due_at", hasta);
    for (const c of cargos ?? []) {
      eventos.push({
        id: `charge-${c.id}`,
        kind: "charge",
        day: dia(c.due_at),
        time: null,
        title: t.chargeDue(c.concept),
        detail: null,
        stateLabel: null,
        href: `${base}/facturacion`,
      });
    }
  }

  return eventos.filter((e) => e.day >= from && e.day <= to);
}
