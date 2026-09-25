"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supportRemainingMinutes, type SupportAccessLevel } from "@/core/platform-admin";
import { es } from "@/i18n/es";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon } from "@/components/ui/Icon";
import { leaveSupportSession } from "@/app/administracion/actions";
import {
  activeDestination,
  createOptions,
  DESTINATION_ICONS,
  globalActiveDestination,
  ABRIR_BUSQUEDA,
  globalCreateOptions,
  globalMenuGroups,
  globalMobileNav,
  isClientRole,
  mobileNav,
  sidebarGroups,
  type NavDestination,
  type ShellRole,
} from "./navigation";
import { MobileContextCard, type ShellContext } from "./MobileContextCard";

export type { ShellContext } from "./MobileContextCard";

export interface SearchResult {
  readonly kind: string;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly state: string | null;
  readonly deepLink: string;
}

/** Hito 19 (§129) · la sesión de Modo soporte de quien mira, si la hay. */
export interface ShellSupportSession {
  readonly id: string;
  readonly accessLevel: SupportAccessLevel;
  readonly reason: string;
  readonly expiresAt: string;
}

export interface ShellNotification {
  readonly id: string;
  readonly eventType: keyof typeof es.notifications.events;
  readonly deepLink: string;
  readonly readAt: string | null;
}

/**
 * El armazón de todas las pantallas del espacio: menú lateral de
 * escritorio (§20.2), barra inferior de móvil con 5 destinos + Más
 * (§20.3), búsqueda global con Ctrl/Cmd + K (§20.5) y centro de avisos
 * (HU-34).
 *
 * CA-22 · navegación completa por teclado: enlace "Saltar al contenido"
 * como primer elemento enfocable, el diálogo de búsqueda devuelve el foco
 * al cerrarse, `Escape` cierra, y todo lo pulsable es un `<button>` o un
 * `<a>` de verdad — nada de `<div onClick>`, que el teclado no alcanza.
 *
 * El armazón **no autoriza nada**: decide qué se pinta. Quién puede entrar
 * en cada destino lo siguen decidiendo RLS y las funciones del servidor
 * (CLAUDE.md: ocultar un botón no es un control de acceso).
 */
/**
 * RN-PAN-04 · un restaurante del selector del panel. Lleva el espacio
 * porque cambiar de local puede cambiar de espacio de mantenimiento, y la
 * dirección lo necesita: la frontera entre espacios es del equipo, no del
 * cliente, pero sigue estando en la ruta (RN-PAN-01).
 */
export interface PanelEstablishment {
  readonly id: string;
  readonly name: string;
  readonly spaceSlug: string;
}

export function AppShell({
  context = "space",
  spaceSlug = "",
  spaceName = "",
  role = "owner",
  roleLabel = "",
  userInitial,
  userLabel,
  notifications,
  onSearch,
  establishmentId = null,
  establishmentName = null,
  establishments = [],
  contexts = [],
  supportSession = null,
  userAvatarUrl = null,
  unreadMessages = 0,
  children,
}: {
  /**
   * De quién es este armazón.
   *
   * `"space"` es el de siempre: un espacio de mantenimiento o el panel de
   * un restaurante, que se distinguen por el rol. `"global"` es §36, la
   * zona de fuera (G01 a G08), que tiene otros destinos y **ninguna caja
   * de contexto**: no estás dentro de nada de lo que salir.
   *
   * Los cuatro campos de abajo —espacio, nombre, rol y su etiqueta— son
   * del armazón de espacio y en `"global"` no se leen. Por eso llevan un
   * valor por omisión en vez de ser obligatorios: quien pinta el contexto
   * global no tiene ninguno de los cuatro que darle, y obligarle a
   * inventárselos sería peor que no pedírselos.
   */
  context?: "space" | "global";
  spaceSlug?: string;
  spaceName?: string;
  role?: ShellRole;
  /** El rol, en el nombre que ve la persona (§20.1: el selector lo enseña). */
  roleLabel?: string;
  /** La inicial del avatar, que es lo que se pinta cuando no hay foto. */
  userInitial: string;
  /**
   * RN-GLO-09 · el enlace firmado y temporal a la foto de quien mira, o
   * `null`. Lo firma el servidor: el bucket es privado y no hay URL
   * pública de ninguna cara. Es **siempre la propia**, así que aquí no hay
   * ninguna frontera de identidad que cuidar.
   */
  userAvatarUrl?: string | null;
  /** Nombre o correo de quien mira, para el nombre accesible del avatar. */
  userLabel: string;
  notifications: readonly ShellNotification[];
  onSearch: (query: string) => Promise<readonly SearchResult[]>;
  /**
   * El restaurante del que se está hablando, cuando quien mira es un
   * cliente y solo tiene uno. Sin él, sus destinos apuntan al selector de
   * contexto en vez de a rutas del equipo (ver `navigation.ts`).
   */
  establishmentId?: string | null;
  /**
   * RN-PAN-03 · el nombre del restaurante, que es lo que el panel enseña
   * arriba. Nulo para el equipo, que ve el nombre de su espacio.
   */
  establishmentName?: string | null;
  /**
   * RN-PAN-04 · todos los restaurantes de quien mira, para el selector del
   * panel. Salen de `my_contexts()`, así que están en el espacio de
   * mantenimiento que estén. Con uno solo no se pinta selector (RN-PAN-05).
   */
  establishments?: readonly PanelEstablishment[];
  /**
   * Móvil · todos los espacios y paneles de quien mira, para el
   * desplegable de la tarjeta de contexto. Salen de `my_contexts()`.
   */
  contexts?: readonly ShellContext[];
  /**
   * Hito 19 (§129, RN-ADM-07) · si quien mira es de Cuotly y está dentro en
   * Modo soporte, se pinta una banda que lo dice —nivel, tiempo que queda,
   * salir— para que no se le olvide que está en casa ajena.
   */
  supportSession?: ShellSupportSession | null;
  /**
   * Conversaciones sin leer, que es el número rojo que el diseño pinta
   * sobre "Mensajes" en la barra de móvil.
   *
   * Lo calcula quien sirve la pantalla y llega ya contado: el armazón no
   * consulta nada. Por omisión es **cero**, y cero no pinta nada — no es
   * "no lo sabemos" disfrazado de "no hay", porque quien no lo pasa es que
   * todavía no lo cuenta, y en ese caso enseñar un número inventado sería
   * peor que no enseñar ninguno (CLAUDE.md, CA-20).
   */
  unreadMessages?: number;
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const esGlobal = context === "global";
  const esPanel = !esGlobal && isClientRole(role);
  const menu = useMemo(
    () => (esGlobal ? globalMenuGroups() : sidebarGroups(spaceSlug, role, establishmentId)),
    [esGlobal, spaceSlug, role, establishmentId],
  );
  /**
   * RN-PAN-01 · la raíz del contexto. Para el equipo es su espacio; para
   * el restaurante, SU panel. El logotipo y la casita de la miga de pan
   * llevan ahí, no a una pantalla del espacio que él no puede abrir.
   */
  const contextHome = esGlobal
    ? "/"
    : esPanel && establishmentId !== null
      ? `/espacios/${spaceSlug}/restaurantes/${establishmentId}`
      : `/espacios/${spaceSlug}`;
  /** RN-PAN-03 · el nombre de arriba: el del local, nunca el del espacio. */
  const contextName = esGlobal
    ? es.globalContext.nav.home
    : esPanel
      ? establishmentName ?? es.restaurantPanel.label
      : spaceName;
  const mobile = useMemo(
    () => (esGlobal ? globalMobileNav() : mobileNav(spaceSlug, role, establishmentId)),
    [esGlobal, spaceSlug, role, establishmentId],
  );
  const creates = useMemo(
    () => (esGlobal ? globalCreateOptions() : createOptions(spaceSlug, role, establishmentId)),
    [esGlobal, spaceSlug, role, establishmentId],
  );
  const active = useMemo(
    () =>
      esGlobal
        ? globalActiveDestination(pathname ?? "")
        : activeDestination(spaceSlug, pathname ?? "", role, establishmentId),
    [esGlobal, spaceSlug, pathname, role, establishmentId],
  );
  const unread = notifications.filter((n) => n.readAt === null).length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);

    // El buscador ancho del Inicio (página 1 del diseño) pide abrir ESTE
    // buscador, no otro suyo: dos cajas que buscan lo mismo acaban
    // comportándose distinto.
    const onAbrir = () => setSearchOpen(true);
    window.addEventListener(ABRIR_BUSQUEDA, onAbrir);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ABRIR_BUSQUEDA, onAbrir);
    };
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchTrigger.current?.focus();
  }, []);

  return (
    <div className="min-h-screen bg-soft-surface text-text lg:flex lg:h-screen lg:p-6">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {es.nav.skipToContent}
      </a>

      {/*
        §20.6 · en escritorio la aplicación es UNA tarjeta con esquinas
        redondeadas sobre el fondo de la página, no un tablero a sangre. Eso
        obliga a que el desplazamiento sea interno: el marco mide lo que la
        ventana (`lg:h-screen`) y quien se desplaza es el `main`, no el
        documento. Si el documento se desplazara, la esquina inferior del
        menú se iría fuera de la vista y la tarjeta dejaría de ser una
        tarjeta.

        Nada de esto pasa por debajo de `lg`: en móvil no hay menú lateral
        que enmarcar, la barra inferior es `fixed` y el desplazamiento
        vuelve a ser el del documento, que es el que espera un teléfono.
      */}
      <div className="flex min-h-screen w-full min-w-0 bg-surface lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:shadow-sm">
        {/*
          §20.2 · el menú del espacio, sobre verde oscuro. Con su propio
          desplazamiento: la lista tiene catorce destinos y en una pantalla
          de portátil no caben sin que el pie —el Agente y Ajustes— se salga.

          Ya no necesita `sticky top-0 h-screen`: es un hijo del marco, que
          mide lo que la ventana, así que se estira solo.
        */}
        <aside className="hidden w-[240px] shrink-0 flex-col bg-primary-dark lg:flex">
          <div className="px-5 pb-5 pt-6">
            <Link
              href={contextHome}
              className="block rounded-lg focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              <span className="block text-2xl font-bold leading-none tracking-tight text-surface">
                {es.common.appName}
              </span>
              <span className="mt-1.5 block text-xs text-sidebar-text">{es.common.appOwner}</span>
            </Link>
          </div>

          {/*
            §20.1 · la acción persistente "Cambiar de espacio". Es UN control,
            no dos: la caja entera lleva al selector de contexto. Dos enlaces
            al mismo sitio, uno encima del otro, es un tabulador de más para
            quien navega con teclado y dos veces lo mismo para quien escucha.
          */}
          {/*
            La caja de contexto y la salida a Cuotly solo existen DENTRO de
            algo. En el contexto global (§36) no se pintan: no hay espacio
            del que cambiar ni sitio al que volver, porque ya estás en la
            raíz. Un "Volver al inicio de Cuotly" en el inicio de Cuotly es
            un enlace que no lleva a ninguna parte.
          */}
          {esGlobal ? null : (
          <div className="px-3">
            {esPanel ? (
              <PanelContextBox
                name={contextName}
                current={establishmentId}
                establishments={establishments}
              />
            ) : (
              <Link
                href="/"
                aria-label={`${spaceName} · ${roleLabel} · ${es.nav.switchSpace}`}
                className="block rounded-field border border-sidebar-border bg-sidebar-raised transition-colors hover:border-accent-green focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <span className="flex items-center gap-2 px-3 py-2.5">
                  <span aria-hidden="true" className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-surface">{spaceName}</span>
                    <span className="block truncate text-xs text-sidebar-text">{roleLabel}</span>
                  </span>
                  <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-sidebar-text" />
                </span>
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center gap-1.5 border-t border-sidebar-border px-3 py-2 text-xs font-medium text-sidebar-text"
                >
                  <Icon name="switchSpace" className="h-3.5 w-3.5" />
                  {es.nav.switchSpace}
                </span>
              </Link>
            )}

            {/*
              §36 · la salida al contexto global, que el diseño pide con
              este nombre en todos los contextos. Es un enlace aparte y no
              otra fila de la caja de arriba: "cambiar de espacio" y "salir
              de los espacios" son dos sitios distintos, y fundirlos haría
              que uno de los dos no se encontrara nunca.
            */}
            <Link
              href="/"
              className="mt-2 block px-1 text-xs font-medium text-sidebar-text underline hover:text-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              {es.globalContext.backToCuotly}
            </Link>
          </div>
          )}

          <nav
            aria-label={esPanel ? es.restaurantPanel.menuLabel : es.nav.menuLabel}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-5 pt-5"
          >
            <ul className="flex flex-col gap-0.5">
              {menu.main.map((destination) => (
                <li key={destination.key}>
                  <SidebarLink destination={destination} active={active?.key === destination.key} />
                </li>
              ))}
            </ul>

            {/*
              El pie no lleva línea divisoria: sobre el verde oscuro el hueco
              de `mt-auto` ya lo separa, y una línea más solo añadiría ruido.
            */}
            <ul className="mt-auto flex flex-col gap-0.5 pt-6">
              {menu.footer.map((destination) => (
                <li key={destination.key}>
                  <SidebarLink destination={destination} active={active?.key === destination.key} />
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          {/*
            La cabecera. En escritorio es **una fila**: miga de pan a la
            izquierda, controles a la derecha. En móvil el diseño la parte en
            **dos**: arriba el logotipo con los controles, y debajo la miga de
            pan entera.

            Antes era una sola fila también en el teléfono, y a 390 px el
            nombre del espacio competía por el sitio con cuatro controles: la
            miga de pan se quedaba en "Arm…", que no dice dónde estás, que es
            su único trabajo. Con dos filas cabe entera y aparece el
            logotipo, que es lo que la maqueta pone ahí.
          */}
          <header className="sticky top-0 z-30 flex flex-col gap-2.5 border-b border-border bg-surface px-4 py-3 lg:flex-row lg:items-center lg:gap-3 lg:px-6">
            <div className="flex items-center gap-3 lg:contents">
              {/* El logotipo solo en móvil: en escritorio ya preside el menú lateral. */}
              <Link
                href={contextHome}
                aria-label={`${es.common.appName} · ${es.nav.home}`}
                className="shrink-0 rounded focus:outline focus:outline-2 focus:outline-cuotly-green lg:hidden"
              >
                <span className="block text-lg font-bold leading-none tracking-tight text-primary-dark">
                  {es.common.appName}
                </span>
                <span className="mt-1 block text-[10px] leading-none text-text-secondary">
                  {es.common.appOwner}
                </span>
              </Link>

              {/* La miga de pan de escritorio. La de móvil va en la fila de abajo. */}
              <nav
                aria-label={es.nav.breadcrumbLabel}
                className="hidden min-w-0 items-center gap-2 lg:flex"
              >
                <Link
                  href={contextHome}
                  className="rounded p-1 text-text-secondary hover:text-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
                >
                  <Icon name="home" className="h-4 w-4" title={es.nav.home} />
                </Link>
                <Icon name="chevronRight" className="h-3.5 w-3.5 text-text-secondary" />
                <span className="truncate text-sm font-medium">{contextName}</span>
                {active === null || active.label === contextName ? null : (
                  <>
                    <Icon name="chevronRight" className="h-3.5 w-3.5 text-text-secondary" />
                    <span className="truncate text-sm font-medium">{active.label}</span>
                  </>
                )}
              </nav>

            <button
              ref={searchTrigger}
              type="button"
              data-testid="search-trigger"
              aria-label={es.search.title}
              onClick={() => setSearchOpen(true)}
              className="ml-auto flex items-center gap-2 rounded-field border border-transparent px-2 py-2 text-sm text-text-secondary transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green lg:w-72 lg:border-border lg:px-3"
            >
              <Icon name="search" className="h-4 w-4" />
              <span className="hidden sm:inline">{es.search.open}</span>
              <kbd className="ml-auto hidden text-xs lg:inline">{es.search.shortcut}</kbd>
            </button>

            <div className="relative">
              <button
                type="button"
                data-testid="notifications-trigger"
                aria-label={`${es.notifications.open}${unread > 0 ? ` (${unread} ${es.notifications.unreadLabel})` : ""}`}
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative rounded-field p-2 text-text-secondary transition-colors hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <Icon name="bell" className="h-5 w-5" />
                {/*
                  El número exacto de avisos no se pinta: es un punto. Quien no
                  lo ve NO pierde el dato —el nombre accesible del botón sigue
                  diciendo cuántos hay (`aria-label`, arriba)—, y quien lo ve
                  tiene el número entero a un clic, en el panel. Sin avisos no
                  hay punto: un cero en un círculo es ruido, no dato (CA-20).
                */}
                {unread > 0 ? (
                  <span
                    aria-hidden="true"
                    data-testid="unread-count"
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger"
                  />
                ) : null}
              </button>

              {notificationsOpen ? (
                <section
                  data-testid="notifications-panel"
                  aria-label={es.notifications.title}
                  className="absolute right-0 top-full z-40 mt-2 w-80 rounded-[20px] border border-border bg-surface p-3 shadow-lg"
                >
                  <h2 className="mb-2 px-1 text-sm font-semibold text-primary-dark">
                    {es.notifications.title}
                  </h2>
                  {notifications.length === 0 ? (
                    <EmptyReason
                      testId="notifications-empty"
                      reason="no_data_yet"
                      title={es.notifications.emptyTitle}
                    />
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <Link
                            href={n.deepLink}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                          >
                            {n.readAt === null ? (
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-cuotly-green"
                              />
                            ) : null}
                            {es.notifications.events[n.eventType]}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>

            {/*
              §20.5 · el botón global Crear. Sigue siendo un `<details>`: se
              abre con Enter y con el ratón sin una línea de JavaScript, que
              es lo que hace que CA-22 se cumpla sin depender de la
              hidratación.
            */}
            {/*
              En móvil este botón NO va aquí: va en el centro de la barra
              inferior, que es donde lo pone el diseño. Tenerlo en los dos
              sitios era ofrecer la misma acción dos veces en una pantalla
              de 390 px, y encima empujaba la miga de pan hasta dejarla en
              "Arm…".

              Y en el contexto global no va en la cabecera **en ninguna
              anchura**: G01 y G04 pintan ahí solo el buscador, la campana y
              el avatar, y ofrecen "Crear espacio de mantenimiento" como
              botón de la propia pantalla. En el teléfono sigue en la barra
              de abajo, que es donde la maqueta de móvil sí lo dibuja.
            */}
            {creates.length > 0 && !esGlobal ? (
              <details data-testid="create-menu" className="relative hidden lg:block">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-field bg-primary px-3.5 py-2 text-sm font-medium text-surface transition-colors hover:bg-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green [&::-webkit-details-marker]:hidden">
                  <Icon name="plus" className="h-4 w-4" />
                  {es.create.label}
                  <Icon name="chevronDown" className="h-4 w-4" />
                </summary>
                <ul className="absolute right-0 z-40 mt-2 w-64 rounded-[20px] border border-border bg-surface p-2 shadow-lg">
                  {creates.map((option) => (
                    <li key={option.key}>
                      <Link
                        href={option.href}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                      >
                        <Icon
                          name={DESTINATION_ICONS[option.key] ?? "plus"}
                          className="h-4 w-4 text-text-secondary"
                        />
                        {option.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <Link
              href="/cuenta/sesiones"
              aria-label={`${es.nav.account} · ${userLabel}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-dark text-sm font-semibold text-surface hover:bg-primary focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              {userAvatarUrl !== null ? (
                /*
                  `unoptimized` a propósito: el enlace es una URL firmada
                  que caduca, y el optimizador de Next la cachearía más de
                  lo que vive, acabando por pedir una ruta muerta. El `alt`
                  va vacío porque el nombre accesible ya lo pone el
                  `aria-label` del enlace: repetirlo lo diría dos veces.
                */
                <Image
                  src={userAvatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <span aria-hidden="true">{userInitial}</span>
              )}
              </Link>
            </div>

            {/*
              Móvil (páginas 21 a 157 del diseño móvil) · debajo del
              logotipo no va la miga de pan: va la **tarjeta de contexto**,
              la misma caja del menú lateral de escritorio en claro. En un
              espacio, el nombre con su rol y "Cambiar de espacio"; en el
              panel, el restaurante con su selector (RN-PAN-04). Es lo que
              en el teléfono dice dónde estás, y además deja cambiarlo, que
              la miga no hacía.

              En el contexto global (§36) no hay nada: no estás dentro de
              nada de lo que cambiar, y el diseño (páginas 1 a 8) no pinta
              ninguna fila ahí.
            */}
            {esGlobal ? null : (
              <div data-testid="mobile-context" className="lg:hidden">
                {/*
                  A la izquierda, dónde estás; tocarla despliega todos tus
                  espacios y paneles. A la derecha, "Volver al inicio
                  global". Igual en el espacio y en el panel.
                */}
                <MobileContextCard
                  name={esPanel ? contextName : spaceName}
                  detail={esPanel ? es.restaurantPanel.label : roleLabel}
                  currentHref={contextHome}
                  contexts={contexts}
                />
              </div>
            )}
          </header>

          {supportSession ? (
            <div
              role="status"
              data-testid="support-banner"
              className="flex flex-wrap items-center gap-3 border-b border-border bg-info/10 px-4 py-2 text-sm text-text lg:px-6"
            >
              <Icon name="lock" className="h-4 w-4 shrink-0 text-info" />
              <span className="font-semibold">{es.platformAdmin.support.bannerTitle}</span>
              <span className="text-text-secondary">
                {es.platformAdmin.support.bannerBody(
                  es.platformAdmin.support.levels[supportSession.accessLevel],
                  supportRemainingMinutes(supportSession.expiresAt, new Date()),
                )}
                {" · "}
                {supportSession.reason}
              </span>
              {supportSession.accessLevel === "read" ? (
                <span className="text-text-secondary">{es.platformAdmin.support.bannerReadOnly}</span>
              ) : null}
              <form action={leaveSupportSession} className="ml-auto">
                <input type="hidden" name="sessionId" value={supportSession.id} />
                <button
                  type="submit"
                  className="rounded-field border border-border bg-surface px-3 py-1 text-xs font-semibold hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                >
                  {es.platformAdmin.support.bannerLeave}
                </button>
              </form>
            </div>
          ) : null}

          <main
            id="contenido"
            aria-label={es.nav.mainLabel}
            className="min-w-0 flex-1 bg-background px-4 pb-24 pt-6 lg:overflow-y-auto lg:px-8 lg:pb-10"
          >
            {children}
          </main>
        </div>
      </div>

      {/*
        §20.3 (decisión 47) · la barra de móvil del diseño: **verde oscuro**,
        con icono y texto, y **Crear (+) en el centro**.
          Inicio · Restaurantes · Crear · Mensajes · Más

        Hasta hoy era una rejilla de cinco columnas con CUATRO enlaces de
        texto suelto sobre fondo blanco. Se veían tres cosas mal a la vez:
        el hueco de la quinta columna dejaba la fila descolgada a la
        izquierda, "Restaurantes" se cortaba en "Restauran…" porque sin
        icono el texto es lo único que hay, y el botón Crear —que §20.5
        llama "global"— no existía en el teléfono; solo estaba arriba,
        donde el diseño no lo pone.

        El centro no sale de `mobileNav()` a propósito: Crear no es un
        destino, es una acción, y `activeDestination()` nunca debe poder
        marcarlo. Por eso la lista trae cuatro y el armazón intercala el
        botón en medio, que es justo lo que ya anunciaba el comentario de
        `BAR_KEYS`.
      */}
      <nav
        aria-label={es.nav.menuLabel}
        data-testid="mobile-nav"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 rounded-t-card bg-primary-dark pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {mobile.slice(0, 2).map((destination) => (
          <MobileBarLink
            key={destination.key}
            destination={destination}
            active={active?.key === destination.key}
            badge={destination.key === "messages" ? unreadMessages : 0}
          />
        ))}

        {creates.length > 0 ? (
          <details data-testid="mobile-create-menu" className="relative">
            <summary className="flex cursor-pointer list-none flex-col items-center gap-1 pb-2 text-center [&::-webkit-details-marker]:hidden">
              {/*
                El círculo sobresale por encima de la barra, como en la
                maqueta. `-mt-5` y no una posición absoluta: así sigue
                ocupando su columna y el resto de la fila se alinea con él
                sin cálculos.
              */}
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-background bg-cuotly-green text-surface shadow-sm">
                <Icon name="plus" className="h-6 w-6" />
              </span>
              <span className="text-[11px] font-medium leading-none text-surface">
                {es.create.label}
              </span>
            </summary>
            {/*
              Se abre HACIA ARRIBA: es el último elemento de la pantalla y
              un menú desplegado hacia abajo caería fuera.
            */}
            <ul className="absolute bottom-full left-1/2 z-40 mb-3 w-64 -translate-x-1/2 rounded-[20px] border border-border bg-surface p-2 shadow-lg">
              {creates.map((option) => (
                <li key={option.key}>
                  <Link
                    href={option.href}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                  >
                    <Icon
                      name={DESTINATION_ICONS[option.key] ?? "plus"}
                      className="h-4 w-4 text-text-secondary"
                    />
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          // Sin nada que crear no se pinta un botón muerto: se deja el
          // hueco, que es lo que mantiene los otros cuatro en su sitio.
          <span aria-hidden="true" />
        )}

        {mobile.slice(2).map((destination) => (
          <MobileBarLink
            key={destination.key}
            destination={destination}
            active={active?.key === destination.key}
            badge={destination.key === "messages" ? unreadMessages : 0}
          />
        ))}
      </nav>

      {searchOpen ? <GlobalSearch onClose={closeSearch} onSearch={onSearch} /> : null}
    </div>
  );
}

/**
 * Un destino del menú lateral. El estado activo se dice con fondo, color
 * y peso a la vez, no solo con color (PRD §21.4), y con `aria-current`
 * para quien no ve ninguno de los tres.
 */
/**
 * RN-PAN-03, RN-PAN-04 y RN-PAN-05 · la caja de contexto del panel del
 * restaurante, que ocupa el sitio de la del espacio.
 *
 * Tres cosas que la diferencian de aquella y que no son de estilo:
 *
 *   · **dice de qué local es, no de qué espacio.** El espacio de
 *     mantenimiento es organización interna del equipo y al cliente no se
 *     le enseña (P7, RN-PAN-03);
 *   · **con un solo restaurante no hay desplegable** (RN-PAN-05). Un
 *     `<details>` de un elemento es una promesa de que hay más, y quien lo
 *     abre y encuentra lo que ya estaba mirando ha perdido un gesto;
 *   · **no es "Cambiar de espacio".** Salir de aquí es "Volver al inicio de
 *     Cuotly", que está justo debajo y es el enlace de siempre.
 *
 * Es un `<details>` y no un menú con estado de React a propósito: funciona
 * sin hidratación, se abre y se cierra con teclado sin que nadie escriba
 * un manejador, y `Escape` lo cierra solo. La misma razón por la que el
 * resto del armazón navega con enlaces de verdad (CA-22).
 */
/** Los colores de la caja del panel, sobre el verde del menú lateral. */
const PANEL_BOX = {
  box: "border-sidebar-border bg-sidebar-raised [&[open]]:border-accent-green",
  title: "text-surface",
  sub: "text-sidebar-text",
  divider: "border-sidebar-border",
  item: "text-sidebar-text hover:bg-primary hover:text-surface",
} as const;

function PanelContextBox({
  name,
  current,
  establishments,
}: {
  name: string;
  current: string | null;
  establishments: readonly PanelEstablishment[];
}) {
  const otros = establishments.filter((e) => e.id !== current);
  const c = PANEL_BOX;

  const identidad = (
    <span className="flex items-center gap-2 px-3 py-2.5">
      <span aria-hidden="true" className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm font-semibold ${c.title}`}>{name}</span>
        <span className={`block truncate text-xs ${c.sub}`}>
          {es.restaurantPanel.label}
        </span>
      </span>
      {otros.length === 0 ? null : (
        <Icon name="chevronDown" className={`h-4 w-4 shrink-0 ${c.sub}`} />
      )}
    </span>
  );

  // RN-PAN-05 · uno solo: se enseña y ya está.
  if (otros.length === 0) {
    return (
      <div
        className={`rounded-field border ${c.box}`}
        aria-label={es.restaurantPanel.singleLabel(name)}
      >
        {identidad}
      </div>
    );
  }

  return (
    <details className={`group rounded-field border ${c.box}`}>
      <summary
        className="cursor-pointer list-none rounded-field transition-colors hover:border-accent-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        aria-label={`${name} · ${es.restaurantPanel.switchLabel}`}
      >
        {identidad}
        <span
          aria-hidden="true"
          className={`flex items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-medium ${c.divider} ${c.sub}`}
        >
          <Icon name="switchSpace" className="h-3.5 w-3.5" />
          {es.restaurantPanel.switchLabel}
        </span>
      </summary>
      <div className={`border-t px-2 py-2 ${c.divider}`}>
        <p className={`px-1 pb-1 text-xs font-medium ${c.sub}`}>
          {es.restaurantPanel.pickerTitle}
        </p>
        <ul className="flex flex-col gap-0.5">
          {otros.map((e) => (
            <li key={e.id}>
              <Link
                href={`/espacios/${e.spaceSlug}/restaurantes/${e.id}`}
                className={`block truncate rounded-field px-2 py-1.5 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${c.item}`}
              >
                {e.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function SidebarLink({
  destination,
  active,
}: {
  destination: NavDestination;
  active: boolean;
}) {
  return (
    <Link
      href={destination.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-field px-3 py-2 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
        active
          ? "bg-primary font-semibold text-surface"
          : "text-sidebar-text hover:bg-sidebar-raised hover:text-surface"
      }`}
    >
      <Icon
        name={DESTINATION_ICONS[destination.key] ?? "chevronRight"}
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-surface" : "text-sidebar-text"}`}
      />
      <span className="min-w-0 shrink-0 truncate">{destination.label}</span>
      {destination.key === "agent" ? (
        <span className="ml-auto shrink-0 rounded bg-sidebar-border px-1.5 py-0.5 text-[10px] font-medium leading-4 text-sidebar-text">
          {es.nav.agentBadge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Un destino de la barra inferior de móvil (§20.3): icono arriba, texto
 * debajo, y el activo marcado con **color, peso y un punto verde** —tres
 * señales, no solo color (PRD §21.4)—, más `aria-current` para quien no ve
 * ninguna de las tres.
 *
 * El número de sin leer se pinta **solo si lo hay**. Un cero en un círculo
 * rojo es ruido, no dato (CA-20), y es la misma regla que ya sigue el
 * punto de la campana.
 */
function MobileBarLink({
  destination,
  active,
  badge,
}: {
  destination: NavDestination;
  active: boolean;
  badge: number;
}) {
  return (
    <Link
      href={destination.href}
      aria-current={active ? "page" : undefined}
      className="flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-center focus:outline focus:outline-2 focus:outline-cuotly-green"
    >
      <span className="relative">
        <Icon
          name={DESTINATION_ICONS[destination.key] ?? "chevronRight"}
          className={`h-[22px] w-[22px] ${active ? "text-surface" : "text-sidebar-text"}`}
        />
        {badge > 0 ? (
          <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-surface">
            {badge}
          </span>
        ) : null}
      </span>
      <span
        className={`block max-w-full truncate text-[11px] leading-none ${
          active ? "font-semibold text-surface" : "text-sidebar-text"
        }`}
      >
        {destination.label}
      </span>
      <span
        aria-hidden="true"
        className={`h-1 w-1 rounded-full ${active ? "bg-accent-green" : "bg-transparent"}`}
      />
    </Link>
  );
}

/**
 * §20.5 · "Nunca devuelve resultados a los que el usuario no tenga acceso
 * (el filtrado ocurre en **servidor**, no en el cliente)."
 *
 * Por eso este componente no filtra nada: manda el texto y pinta lo que
 * vuelve. Filtrar aquí sería creer que el cliente puede decidir qué se
 * puede ver, que es exactamente lo que CLAUDE.md prohíbe.
 */
function GlobalSearch({
  onClose,
  onSearch,
}: {
  onClose: () => void;
  onSearch: (query: string) => Promise<readonly SearchResult[]>;
}) {
  const [query, setQuery] = useState("");
  // Un único estado con la búsqueda a la que pertenece el resultado. Dos
  // estados separados (`results` y `searched`) obligaban a limpiarlos
  // desde el efecto cuando el texto se acorta, y eso es precisamente lo
  // que React desaconseja: el "todavía no hay resultados" se DERIVA de
  // comparar la consulta pendiente con la contestada.
  const [outcome, setOutcome] = useState<{ query: string; items: readonly SearchResult[] } | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const tooShort = trimmed.length < 2;
  const answered = !tooShort && outcome?.query === trimmed;
  const results = answered ? outcome.items : [];

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const pending = query.trim();
    if (pending.length < 2) return;

    let cancelled = false;
    void onSearch(pending).then((found) => {
      if (!cancelled) setOutcome({ query: pending, items: found });
    });
    return () => {
      cancelled = true;
    };
  }, [query, onSearch]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={es.search.title}
      data-testid="search-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center bg-primary-dark/40 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="mt-[10vh] w-full max-w-xl rounded-[20px] border border-border bg-surface p-4 shadow-lg">
        <label htmlFor="busqueda-global" className="text-sm font-semibold">
          {es.search.title}
        </label>
        <div className="relative mt-2">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          />
          <input
            id="busqueda-global"
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={es.search.placeholder}
            className="w-full rounded-[10px] border border-border py-2 pl-9 pr-3 focus:outline focus:outline-2 focus:outline-cuotly-green"
          />
        </div>

        {tooShort ? (
          <p className="mt-3 text-sm text-text-secondary">{es.search.minLength}</p>
        ) : answered && results.length === 0 ? (
          <div className="mt-3">
            <EmptyReason testId="search-empty" reason="no_data_yet" title={es.search.noResults} />
          </div>
        ) : (
          <ul aria-label={es.search.resultsLabel} className="mt-3 flex flex-col gap-1">
            {results.map((result) => (
              <li key={`${result.kind}-${result.id}`}>
                <Link
                  href={result.deepLink}
                  className="block rounded-lg px-3 py-2 hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                >
                  <span className="text-xs text-text-secondary">
                    {es.naming.entities[result.kind as keyof typeof es.naming.entities] ?? result.kind}
                  </span>
                  <span className="block">{result.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded-[10px] border border-border px-3 py-1.5 text-sm focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {es.common.close}
        </button>
      </div>
    </div>
  );
}
