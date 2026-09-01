import { es } from "@/i18n/es";

/**
 * PRD §20.2 (menú de escritorio) y §20.3 (5 destinos + Más en móvil).
 *
 * La navegación es un DATO, no JSX: así el mismo origen alimenta el menú
 * de escritorio, la barra inferior de móvil y los tests, y no puede
 * haber un destino que exista en una superficie y no en la otra. Es la
 * mitad estructural de CA-21.
 */
export type ShellRole = "owner" | "admin" | "worker" | "client" | "client_daily_menu";

export interface NavDestination {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

const D = (key: string, label: string, path: string) => ({ key, label, href: path });

export function desktopMenu(spaceSlug: string): readonly NavDestination[] {
  const base = `/espacios/${spaceSlug}`;
  return [
    D("home", es.nav.home, `${base}`),
    D("establishments", es.nav.establishments, `${base}/restaurantes`),
    D("requests", es.nav.requests, `${base}/solicitudes`),
    D("jobs", es.nav.jobs, `${base}/trabajos`),
    D("tasks", es.nav.tasks, `${base}/tareas`),
    D("dailyMenu", es.nav.dailyMenu, `${base}/menu-diario`),
    D("messages", es.nav.messages, `${base}/mensajes`),
    D("calendar", es.nav.calendar, `${base}/calendario`),
    D("finance", es.nav.finance, `${base}/finanzas`),
    D("reports", es.nav.reports, `${base}/informes`),
    D("team", es.nav.team, `${base}/equipo`),
    D("plans", es.nav.plans, `${base}/planes`),
    D("agent", es.nav.agent, `${base}/agente`),
    D("settings", es.nav.settings, `${base}/ajustes`),
  ];
}

/**
 * §20.3 · exactamente cinco destinos y "Más". Son cinco y no seis porque
 * una barra inferior con más de cinco deja de ser pulsable con el pulgar,
 * y el PRD lo fija así.
 */
/**
 * Para el equipo, los destinos cuelgan del espacio. Para el **cliente**, no:
 * sus solicitudes viven dentro de su restaurante
 * (`/espacios/<espacio>/restaurantes/<id>/…`), porque un cliente puede
 * tener varios y "sus solicitudes" no significa nada sin decir de cuál.
 *
 * Cuando no se sabe de qué restaurante hablamos —tiene más de uno, o el
 * armazón se está enseñando fuera de contexto— los destinos del cliente
 * apuntan al selector de contexto, que es donde elige. Nunca a una ruta
 * del equipo: ahí no tiene nada que hacer y solo vería un 404 o una
 * pantalla sin permiso.
 */
function clientBase(spaceSlug: string, establishmentId: string | null): string | null {
  return establishmentId === null ? null : `/espacios/${spaceSlug}/restaurantes/${establishmentId}`;
}

export function mobileNav(
  spaceSlug: string,
  role: ShellRole,
  establishmentId: string | null = null,
): readonly NavDestination[] {
  const base = `/espacios/${spaceSlug}`;
  const more = D("more", es.nav.more, `${base}/mas`);
  const mine = clientBase(spaceSlug, establishmentId);

  switch (role) {
    case "owner":
    case "admin":
      return [
        D("home", es.nav.home, base),
        D("requests", es.nav.requests, `${base}/solicitudes`),
        D("jobs", es.nav.jobs, `${base}/trabajos`),
        D("messages", es.nav.messages, `${base}/mensajes`),
        more,
      ];
    case "worker":
      return [
        D("home", es.nav.home, base),
        D("jobs", es.nav.jobs, `${base}/trabajos`),
        D("tasks", es.nav.tasks, `${base}/tareas`),
        D("messages", es.nav.messages, `${base}/mensajes`),
        more,
      ];
    case "client_daily_menu":
      return [
        D("home", es.nav.home, mine ?? "/"),
        D("requests", es.nav.requests, mine ?? "/"),
        D("dailyMenu", es.nav.dailyMenu, mine ? `${mine}/menu-diario` : "/"),
        D("messages", es.nav.messages, mine ?? "/"),
        more,
      ];
    case "client":
      return [
        D("home", es.nav.home, mine ?? "/"),
        D("requests", es.nav.requests, mine ?? "/"),
        D("newRequest", es.nav.newRequest, mine ?? "/"),
        D("billing", es.nav.finance, mine ? `${mine}/facturacion` : "/"),
        more,
      ];
  }
}

/**
 * §20.5 · "Botón global **Crear** cuyas opciones dependen del contexto y
 * los permisos." Las opciones se derivan del rol, no se ocultan en la
 * pantalla: el servidor vuelve a comprobar el permiso al ejecutar
 * (CLAUDE.md MUST — "ocultar un botón NO es un control de acceso").
 */
export function createOptions(
  spaceSlug: string,
  role: ShellRole,
  establishmentId: string | null = null,
): readonly NavDestination[] {
  const base = `/espacios/${spaceSlug}`;
  const mine = clientBase(spaceSlug, establishmentId);
  switch (role) {
    case "owner":
      return [
        D("establishment", es.create.establishment, `${base}/restaurantes/nuevo`),
        D("invite", es.create.invite, `${base}/equipo/invitar`),
        D("holiday", es.create.holiday, `${base}/calendario/festivo`),
      ];
    case "admin":
      return [
        D("establishment", es.create.establishment, `${base}/restaurantes/nuevo`),
        D("holiday", es.create.holiday, `${base}/calendario/festivo`),
      ];
    case "worker":
      return [D("absence", es.create.absence, `${base}/calendario/ausencia`)];
    case "client":
    case "client_daily_menu":
      // El formulario de pedir un cambio vive en la ficha del restaurante,
      // no en una ruta aparte: el restaurante ya está mirando la suya.
      return [D("request", es.create.request, mine ?? "/")];
  }
}
