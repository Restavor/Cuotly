import type { IconName } from "@/components/ui/Icon";
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

/**
 * Los roles que son del RESTAURANTE y no del equipo de mantenimiento.
 *
 * Existe porque comparar `role !== "client"` a mano se hizo dos veces y
 * las dos estaban mal: el restaurante que tiene contratado Menú Diario
 * resuelve a `client_daily_menu` (§20.3, otra barra de móvil), ese rol no
 * era igual a `"client"` y caía del lado del equipo. En el layout del
 * espacio eso era un 404 en TODAS sus pantallas —`spaces_select` exige ser
 * miembro del espacio y un restaurante no lo es, así que `space` llega
 * vacío y la guarda lo echaba—, y en la ficha del restaurante le servía la
 * pantalla interna del equipo, que tampoco puede leer.
 *
 * Se enumera en una lista y no se pregunta `role.startsWith("client")`
 * porque un rol nuevo llamado, por ejemplo, `client_manager` heredaría la
 * respuesta sin que nadie lo decidiera. `navigation.test.ts` comprueba que
 * todo `ShellRole` cae en un lado o en el otro: un rol nuevo sin clasificar
 * hace fallar el test.
 *
 * **No autoriza nada.** Decide qué pantalla se sirve; quién puede leer qué
 * lo siguen decidiendo RLS y las funciones del servidor (CLAUDE.md).
 */
export const CLIENT_ROLES = ["client", "client_daily_menu"] as const;

export type ClientShellRole = (typeof CLIENT_ROLES)[number];
export type StaffShellRole = Exclude<ShellRole, ClientShellRole>;

/*
 * Son predicados de tipo y no funciones que devuelven `boolean` a secas:
 * así, dentro de un `if (isStaffRole(role))`, el rol ya ES uno de los tres
 * del equipo y se puede pasar donde se espera eso, sin repetir la lista
 * —que es como aparecieron las comparaciones a mano que estaban mal—.
 */
export function isClientRole(role: ShellRole): role is ClientShellRole {
  return (CLIENT_ROLES as readonly ShellRole[]).includes(role);
}

export function isStaffRole(role: ShellRole): role is StaffShellRole {
  return !isClientRole(role);
}

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
    // Fase 4 · Hito 21 · el centro de ayuda de §133 (RN-SOP-10).
    D("help", es.nav.help, `${base}/ayuda`),
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

/**
 * RN-PAN-07 · los tres destinos del panel que **son secciones de la misma
 * página**, con su ancla.
 *
 * El panel del restaurante es hoy una pantalla larga con todos sus
 * bloques, así que "Solicitudes", "Nueva solicitud" y "Mensajes" apuntaban
 * los tres a la misma dirección. En la barra de móvil eso pasaba
 * desapercibido —son iconos y se pulsan de uno en uno—, pero una barra
 * lateral con tres filas seguidas que van al mismo sitio sin decir a qué
 * parte es una barra que miente.
 *
 * El ancla es lo honesto **mientras la página sea una**: no inventa rutas
 * que no existen, y el día que cada bloque sea su propia pantalla, estas
 * tres constantes se cambian por rutas y no hay que tocar nada más. Los
 * identificadores tienen que existir en la página del restaurante:
 * `panel-anclas.test.tsx` falla si alguno no está.
 */
export const PANEL_ANCHORS = {
  requests: "#solicitudes",
  newRequest: "#nueva-solicitud",
  messages: "#mensajes",
} as const;

export type PanelAnchorKey = keyof typeof PANEL_ANCHORS;

/**
 * El destino **sin el ancla**, que es lo que hay que comparar y lo que hay
 * que navegar fuera del navegador.
 *
 * En la web el ancla es del navegador y no hace falta quitarla para ir:
 * basta para comparar. En la app del teléfono sí hace falta para las dos
 * cosas — `expo-router` casa rutas de ficheros y no sabe de fragmentos, así
 * que `/espacios/x/restaurantes/y#solicitudes` no es ninguna de sus rutas y
 * acababa en la pantalla de "esto está en la web". Un restaurante que
 * abriera "Más" y tocara Solicitudes, Nueva solicitud o Mensajes se
 * encontraba con que sus tres destinos no estaban en la app, y sí estaban.
 */
export function hrefWithoutAnchor(href: string): string {
  return href.split("#")[0].replace(/\/+$/, "") || "/";
}

/**
 * §20.3 (reescrito el 19/09/2026, decisión 47) · **una sola barra, la
 * misma para todos los roles y en todos los contextos**:
 *
 *     Inicio · Restaurantes · Crear (+) · Mensajes · Más
 *
 * Hasta ese día había cuatro barras distintas, una por rol. El diseño
 * definitivo móvil pone la misma en las 157 vistas, y el motivo que lo hace
 * defendible es que **una barra que cambia de forma según quién entra no se
 * aprende**: con la misma en todas partes, el pulgar sabe dónde está
 * Mensajes sin mirar, y lo que cambia es a dónde lleva.
 *
 * El **Crear** central no sale de aquí: no es un destino, es la acción de
 * §20.5 (`createOptions`), y por eso esta función devuelve **cuatro**
 * destinos y el armazón pone el botón en medio. Meterlo aquí como un quinto
 * con un `href` falso habría hecho que `activeDestination()` lo pudiera
 * marcar como activo, y una acción no está nunca "activa".
 *
 * A dónde lleva cada uno depende del contexto, que es lo que sustituye a la
 * barra por rol:
 *
 *   · **Inicio** — el del espacio, el del panel, o el global;
 *   · **Restaurantes** — los del espacio si eres del equipo; los tuyos, en
 *     el Inicio global, si eres restaurante. No se inventa una ruta nueva:
 *     el Inicio global ya los lista (RN-GLO-03);
 *   · **Mensajes** — la bandeja del espacio, la del panel o la global;
 *   · **Más** — el resto de su superficie.
 */
export const BAR_KEYS = ["home", "establishments", "messages", "more"] as const;

export function mobileNav(
  spaceSlug: string,
  role: ShellRole,
  establishmentId: string | null = null,
): readonly NavDestination[] {
  const base = `/espacios/${spaceSlug}`;
  const mine = clientBase(spaceSlug, establishmentId);

  // El restaurante: su inicio es su panel, y sus restaurantes son los suyos,
  // que están en el Inicio global. Sin panel identificado —tiene varios, o
  // el armazón se pinta fuera de contexto— todo va al Inicio global, que es
  // donde elige, y nunca a una ruta del equipo.
  if (isClientRole(role)) {
    return [
      D("home", es.nav.home, mine ?? GLOBAL_HOME),
      D("establishments", es.nav.establishments, GLOBAL_HOME),
      D("messages", es.nav.messages, mine ? `${mine}${PANEL_ANCHORS.messages}` : GLOBAL_HOME),
      // "Más" es la MISMA ruta para todos: `/espacios/<slug>/mas` ya
      // decide su contenido por rol con `moreDestinations()`. Una ruta
      // propia bajo el restaurante habría sido una pantalla más que
      // mantener diciendo lo mismo.
      D("more", es.nav.more, `${base}/mas`),
    ];
  }

  return [
    D("home", es.nav.home, base),
    D("establishments", es.nav.establishments, `${base}/restaurantes`),
    D("messages", es.nav.messages, `${base}/mensajes`),
    D("more", es.nav.more, `${base}/mas`),
  ];
}

/** §36 · el Inicio global, la raíz de quien no está en ningún contexto. */
const GLOBAL_HOME = "/inicio";

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

/**
 * La superficie COMPLETA de un rol: todos los destinos que le pertenecen,
 * quepan o no en los cinco de la barra de móvil.
 *
 * Para el equipo esa superficie es el menú de §20.2, que es justo lo que
 * ya devuelve `desktopMenu`. Para el cliente NO: el menú de escritorio es
 * del equipo —`/solicitudes`, `/trabajos`, `/equipo`— y ahí un
 * restaurante no tiene nada que hacer. Sus destinos cuelgan de su propio
 * restaurante, igual que en `mobileNav`.
 *
 * Menú Diario solo aparece para quien lo tiene contratado
 * (`client_daily_menu`). Ofrecérselo a un restaurante sin el servicio
 * sería enseñarle una puerta que no es suya.
 */
export function fullNav(
  spaceSlug: string,
  role: ShellRole,
  establishmentId: string | null = null,
): readonly NavDestination[] {
  const mine = clientBase(spaceSlug, establishmentId);

  switch (role) {
    case "owner":
    case "admin":
    case "worker":
      return desktopMenu(spaceSlug);
    // Fase 3 · Hito 14 · "Informes y datos" y "Autorizar fuentes" son dos
    // destinos del panel del restaurante (vistas 22 y 25.03), no dos
    // bloques de su inicio.
    case "client":
      return [
        D("home", es.nav.home, mine ?? "/"),
        D("requests", es.nav.requests, mine ? `${mine}${PANEL_ANCHORS.requests}` : "/"),
        D("newRequest", es.nav.newRequest, mine ? `${mine}${PANEL_ANCHORS.newRequest}` : "/"),
        D("messages", es.nav.messages, mine ? `${mine}${PANEL_ANCHORS.messages}` : "/"),
        D("billing", es.nav.finance, mine ? `${mine}/facturacion` : "/"),
        D("data", es.nav.data, mine ? `${mine}/datos` : "/"),
        D("sources", es.nav.sources, mine ? `${mine}/fuentes` : "/"),
        // §131 · el restaurante consulta las guías; las incidencias, no.
        D("help", es.nav.help, mine ? `${mine}/ayuda` : "/"),
      ];
    case "client_daily_menu":
      return [
        D("home", es.nav.home, mine ?? "/"),
        D("requests", es.nav.requests, mine ? `${mine}${PANEL_ANCHORS.requests}` : "/"),
        D("newRequest", es.nav.newRequest, mine ? `${mine}${PANEL_ANCHORS.newRequest}` : "/"),
        D("dailyMenu", es.nav.dailyMenu, mine ? `${mine}/menu-diario` : "/"),
        D("messages", es.nav.messages, mine ? `${mine}${PANEL_ANCHORS.messages}` : "/"),
        D("billing", es.nav.finance, mine ? `${mine}/facturacion` : "/"),
        D("data", es.nav.data, mine ? `${mine}/datos` : "/"),
        D("sources", es.nav.sources, mine ? `${mine}/fuentes` : "/"),
        D("help", es.nav.help, mine ? `${mine}/ayuda` : "/"),
      ];
  }
}

/**
 * §20.3 · el sexto elemento de la barra de móvil. "Más" es literalmente
 * el resto: lo que no cabe en los cinco.
 *
 * Se DERIVA de las dos listas anteriores en vez de escribirse a mano, que
 * es la mitad estructural de CA-21 aplicada aquí: si mañana un destino
 * entra o sale de la barra, "Más" se ajusta solo. Una tercera lista
 * escrita a mano sería la tercera que se queda desfasada — ya pasó con
 * los estados (salvedad 18 del ROADMAP).
 *
 * Y se le añaden las dos acciones que no son del espacio sino de la
 * cuenta, y que hoy solo se alcanzan desde el selector de contexto:
 * "Cambiar de espacio" (§20.1) y "Mis sesiones" (HU-05). En escritorio se
 * llega a ellas por el menú y por Ajustes; en móvil, sin esta pantalla, no
 * se llegaba por ningún sitio.
 */
export function moreDestinations(
  spaceSlug: string,
  role: ShellRole,
  establishmentId: string | null = null,
): readonly NavDestination[] {
  const enLaBarra = new Set(mobileNav(spaceSlug, role, establishmentId).map((d) => d.key));

  return [
    ...fullNav(spaceSlug, role, establishmentId).filter((d) => !enLaBarra.has(d.key)),
    D("switchSpace", es.nav.switchSpace, "/"),
    D("sessions", es.nav.sessions, "/cuenta/sesiones"),
  ];
}

/**
 * El icono de cada destino del menú (§20.2). Vive aquí, junto a la lista
 * de destinos, y no dentro del JSX del armazón: así el barrido de
 * `navigation.test.ts` puede comprobar que **todo** destino tiene el suyo.
 * Un destino nuevo sin icono no se pinta con un hueco en blanco — hace
 * fallar el test.
 */
export const DESTINATION_ICONS: Readonly<Record<string, IconName>> = {
  home: "home",
  establishments: "building",
  requests: "request",
  jobs: "job",
  tasks: "task",
  dailyMenu: "dailyMenu",
  messages: "messages",
  calendar: "calendar",
  finance: "finance",
  reports: "reports",
  team: "team",
  plans: "plans",
  help: "help",
  agent: "agent",
  settings: "settings",
  // Destinos que solo existen en móvil o en el botón Crear.
  more: "more",
  newRequest: "plus",
  billing: "finance",
  data: "reports",
  sources: "database",
  switchSpace: "switchSpace",
  sessions: "person",
};

/**
 * Los dos destinos que el menú de escritorio deja abajo del todo,
 * separados del resto: el Agente (que todavía no hace nada, §20.2
 * "Próximamente") y Ajustes.
 *
 * No es una lista aparte de destinos —eso sería la tercera copia que se
 * desfasa—: es una partición de `desktopMenu()`, así que un destino nuevo
 * aparece arriba sin tocar nada, y quitar uno de estos dos del menú lo
 * quita de los dos sitios a la vez.
 */
const FOOTER_KEYS = new Set(["agent", "settings"]);

export function desktopMenuGroups(spaceSlug: string): {
  readonly main: readonly NavDestination[];
  readonly footer: readonly NavDestination[];
} {
  const todos = desktopMenu(spaceSlug);
  return {
    main: todos.filter((d) => !FOOTER_KEYS.has(d.key)),
    footer: todos.filter((d) => FOOTER_KEYS.has(d.key)),
  };
}

/**
 * RN-PAN-07 · la barra lateral de escritorio, según de quién sea el
 * armazón.
 *
 * Hasta el 17/09/2026 esta función no existía y el armazón pintaba
 * `desktopMenuGroups()` **siempre**, también para un restaurante. El
 * resultado era que un cliente veía en su barra lateral los catorce
 * destinos del equipo —Trabajos, Tareas, Equipo, Finanzas del espacio,
 * Planes, Ajustes— y cada uno le daba una pantalla sin permiso o un 404.
 * No era un agujero de seguridad (RLS no se entera de lo que se pinta),
 * pero sí catorce puertas que no son suyas ofrecidas por su nombre.
 *
 * Para el equipo devuelve exactamente lo de antes. Para el restaurante,
 * sus destinos —los de `fullNav()`, que ya los tenía bien— con Ayuda
 * abajo, que es el único que hace de pie: no hay Ajustes del espacio ni
 * Agente en un panel de restaurante.
 */
export function sidebarGroups(
  spaceSlug: string,
  role: ShellRole,
  establishmentId: string | null = null,
): {
  readonly main: readonly NavDestination[];
  readonly footer: readonly NavDestination[];
} {
  if (isStaffRole(role)) return desktopMenuGroups(spaceSlug);

  const todos = fullNav(spaceSlug, role, establishmentId);
  return {
    main: todos.filter((d) => !PANEL_FOOTER_KEYS.has(d.key)),
    footer: todos.filter((d) => PANEL_FOOTER_KEYS.has(d.key)),
  };
}

/**
 * El pie de la barra del panel. Solo Ayuda: §131 dice que el restaurante
 * consulta las guías, y no hay nada más que vaya abajo en su contexto.
 */
const PANEL_FOOTER_KEYS = new Set(["help"]);

/**
 * Qué destino del menú corresponde a la dirección que se está mirando.
 * Sirve para dos cosas que en la captura son la misma: marcar el destino
 * activo en el menú lateral y poner el nombre de la pantalla en la miga
 * de pan de la cabecera.
 *
 * Gana el destino cuya ruta es el prefijo **más largo** de la dirección:
 * `/espacios/x/trabajos/123` es "Trabajos", no "Inicio", aunque los dos
 * casen. Y se compara por segmentos completos, para que
 * `/espacios/x/tareas` no active "Tar…" de nada que empiece igual.
 */
export function activeDestination(
  spaceSlug: string,
  pathname: string,
  role: ShellRole = "owner",
  establishmentId: string | null = null,
): NavDestination | null {
  const limpio = pathname.split("?")[0].replace(/\/+$/, "") || "/";

  /*
   * RN-PAN-07 · contra qué lista se compara depende de quién mira.
   *
   * Sin esto, un restaurante en `/espacios/x/restaurantes/<id>/facturacion`
   * casaba con "Restaurantes" del menú del EQUIPO —`/espacios/x/restaurantes`
   * es prefijo suyo— y su miga de pan decía "Restaurantes", que es una
   * pantalla que él no puede abrir. El ancla se quita antes de comparar:
   * `#mensajes` es la misma pantalla que su Inicio.
   */
  const lista = isStaffRole(role)
    ? desktopMenu(spaceSlug)
    : fullNav(spaceSlug, role, establishmentId);

  return lista
    .filter((d) => {
      const href = hrefWithoutAnchor(d.href);
      return limpio === href || limpio.startsWith(`${href}/`);
    })
    .reduce<NavDestination | null>(
      (mejor, d) =>
        mejor === null || hrefWithoutAnchor(d.href).length > hrefWithoutAnchor(mejor.href).length ? d : mejor,
      null,
    );
}
