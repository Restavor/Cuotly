"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { es } from "@/i18n/es";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon } from "@/components/ui/Icon";
import {
  activeDestination,
  createOptions,
  DESTINATION_ICONS,
  desktopMenuGroups,
  mobileNav,
  type NavDestination,
  type ShellRole,
} from "./navigation";

export interface SearchResult {
  readonly kind: string;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly state: string | null;
  readonly deepLink: string;
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
export function AppShell({
  spaceSlug,
  spaceName,
  role,
  roleLabel,
  userInitial,
  userLabel,
  notifications,
  onSearch,
  establishmentId = null,
  children,
}: {
  spaceSlug: string;
  spaceName: string;
  role: ShellRole;
  /** El rol, en el nombre que ve la persona (§20.1: el selector lo enseña). */
  roleLabel: string;
  /** La inicial del avatar. Nunca una foto: no hay fotos de perfil. */
  userInitial: string;
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
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const menu = useMemo(() => desktopMenuGroups(spaceSlug), [spaceSlug]);
  const mobile = useMemo(
    () => mobileNav(spaceSlug, role, establishmentId),
    [spaceSlug, role, establishmentId],
  );
  const creates = useMemo(
    () => createOptions(spaceSlug, role, establishmentId),
    [spaceSlug, role, establishmentId],
  );
  const active = useMemo(
    () => activeDestination(spaceSlug, pathname ?? ""),
    [spaceSlug, pathname],
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
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchTrigger.current?.focus();
  }, []);

  return (
    <div className="flex min-h-screen bg-background text-text">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {es.nav.skipToContent}
      </a>

      {/*
        §20.2 · el menú del espacio. Fijo a la izquierda y con su propio
        desplazamiento: la lista tiene catorce destinos y en una pantalla
        de portátil no caben sin que el pie —el Agente y Ajustes— se salga.
      */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="px-5 pb-4 pt-6">
          <Link
            href={`/espacios/${spaceSlug}`}
            className="block rounded-lg focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <span className="block text-2xl font-bold leading-none tracking-tight text-primary-dark">
              {es.common.appName}
            </span>
            <span className="mt-1 block text-xs text-text-secondary">{es.common.appOwner}</span>
          </Link>
        </div>

        {/*
          §20.1 · la acción persistente "Cambiar de espacio". Es UN control,
          no dos: la caja entera lleva al selector de contexto. Dos enlaces
          al mismo sitio, uno encima del otro, es un tabulador de más para
          quien navega con teclado y dos veces lo mismo para quien escucha.
        */}
        <div className="px-3">
          <Link
            href="/"
            aria-label={`${spaceName} · ${roleLabel} · ${es.nav.switchSpace}`}
            className="block rounded-[10px] border border-border transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <span className="flex items-center gap-2 px-3 py-2.5">
              <span aria-hidden="true" className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text">{spaceName}</span>
                <span className="block truncate text-xs text-text-secondary">{roleLabel}</span>
              </span>
              <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-text-secondary" />
            </span>
            <span
              aria-hidden="true"
              className="flex items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-xs font-medium text-cuotly-green"
            >
              <Icon name="switchSpace" className="h-3.5 w-3.5" />
              {es.nav.switchSpace}
            </span>
          </Link>
        </div>

        <nav
          aria-label={es.nav.menuLabel}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4 pt-4"
        >
          <ul className="flex flex-col gap-0.5">
            {menu.main.map((destination) => (
              <li key={destination.key}>
                <SidebarLink destination={destination} active={active?.key === destination.key} />
              </li>
            ))}
          </ul>

          <ul className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
            {menu.footer.map((destination) => (
              <li key={destination.key}>
                <SidebarLink destination={destination} active={active?.key === destination.key} />
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:px-6">
          {/*
            Miga de pan: dónde está quien mira. En móvil no hay menú lateral
            que lo diga, así que el nombre del espacio ocupa su sitio.
          */}
          <nav aria-label={es.nav.breadcrumbLabel} className="flex min-w-0 items-center gap-2">
            <Link
              href={`/espacios/${spaceSlug}`}
              className="rounded p-1 text-text-secondary hover:text-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              <Icon name="home" className="h-4 w-4" title={es.nav.home} />
            </Link>
            <span aria-hidden="true" className="text-border lg:hidden">
              /
            </span>
            <span className="truncate text-sm font-medium lg:hidden">{spaceName}</span>
            {active === null ? null : (
              <>
                <Icon name="chevronRight" className="hidden h-3.5 w-3.5 text-text-secondary lg:block" />
                <span className="hidden truncate text-sm font-medium lg:block">{active.label}</span>
              </>
            )}
          </nav>

          <button
            ref={searchTrigger}
            type="button"
            data-testid="search-trigger"
            aria-label={es.search.title}
            onClick={() => setSearchOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green lg:w-72"
          >
            <Icon name="search" className="h-4 w-4" />
            <span className="hidden sm:inline">{es.search.open}</span>
            <kbd className="ml-auto hidden rounded bg-soft-surface px-1.5 py-0.5 text-xs lg:inline">
              {es.search.shortcut}
            </kbd>
          </button>

          <div className="relative">
            <button
              type="button"
              data-testid="notifications-trigger"
              aria-label={`${es.notifications.open}${unread > 0 ? ` (${unread} ${es.notifications.unreadLabel})` : ""}`}
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative rounded-[10px] border border-border p-2 text-text transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              <Icon name="bell" className="h-5 w-5" />
              {unread > 0 ? (
                <span
                  data-testid="unread-count"
                  className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[18px] text-surface"
                >
                  {unread}
                </span>
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
          {creates.length > 0 ? (
            <details data-testid="create-menu" className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-sm font-medium text-surface hover:bg-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green [&::-webkit-details-marker]:hidden">
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-surface text-sm font-semibold text-primary-dark hover:bg-border focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <span aria-hidden="true">{userInitial}</span>
          </Link>
        </header>

        <main
          id="contenido"
          aria-label={es.nav.mainLabel}
          className="min-w-0 flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label={es.nav.menuLabel}
        data-testid="mobile-nav"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface lg:hidden"
      >
        {mobile.map((destination) => (
          <Link
            key={destination.key}
            href={destination.href}
            className="truncate px-1 py-3 text-center text-xs focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {destination.label}
          </Link>
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
      className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
        active
          ? "bg-soft-surface font-semibold text-primary-dark"
          : "text-text hover:bg-soft-surface"
      }`}
    >
      <Icon
        name={DESTINATION_ICONS[destination.key] ?? "chevronRight"}
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-cuotly-green" : "text-text-secondary"}`}
      />
      <span className="min-w-0 shrink-0 truncate">{destination.label}</span>
      {destination.key === "agent" ? (
        <span className="ml-auto shrink-0 rounded bg-soft-surface px-1 py-0.5 text-[10px] font-medium leading-4 text-text-secondary">
          {es.nav.agentBadge}
        </span>
      ) : null}
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
