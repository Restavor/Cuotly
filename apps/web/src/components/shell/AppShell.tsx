"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { es } from "@/i18n/es";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { createOptions, desktopMenu, mobileNav, type ShellRole } from "./navigation";

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
 * El armazón de todas las pantallas del espacio: menú de escritorio (§20.2),
 * barra inferior de móvil con 5 destinos + Más (§20.3), búsqueda global con
 * Ctrl/Cmd + K (§20.5) y centro de avisos (HU-34).
 *
 * CA-22 · navegación completa por teclado: enlace "Saltar al contenido"
 * como primer elemento enfocable, el diálogo de búsqueda devuelve el foco
 * al cerrarse, `Escape` cierra, y todo lo pulsable es un `<button>` o un
 * `<a>` de verdad — nada de `<div onClick>`, que el teclado no alcanza.
 */
export function AppShell({
  spaceSlug,
  spaceName,
  role,
  notifications,
  onSearch,
  establishmentId = null,
  children,
}: {
  spaceSlug: string;
  spaceName: string;
  role: ShellRole;
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

  const menu = useMemo(() => desktopMenu(spaceSlug), [spaceSlug]);
  const mobile = useMemo(
    () => mobileNav(spaceSlug, role, establishmentId),
    [spaceSlug, role, establishmentId],
  );
  const creates = useMemo(
    () => createOptions(spaceSlug, role, establishmentId),
    [spaceSlug, role, establishmentId],
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
    <div className="min-h-screen bg-background text-text">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {es.nav.skipToContent}
      </a>

      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <span className="truncate font-semibold">{spaceName}</span>

        <button
          ref={searchTrigger}
          type="button"
          data-testid="search-trigger"
          onClick={() => setSearchOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {es.search.open}
          <kbd className="hidden rounded bg-soft-surface px-1.5 py-0.5 text-xs sm:inline">
            {es.search.hint}
          </kbd>
        </button>

        <button
          type="button"
          data-testid="notifications-trigger"
          aria-label={`${es.notifications.open}${unread > 0 ? ` (${unread} ${es.notifications.unreadLabel})` : ""}`}
          onClick={() => setNotificationsOpen((open) => !open)}
          className="relative rounded-lg border border-border px-3 py-1.5 text-sm focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {es.notifications.title}
          {unread > 0 ? (
            <span
              data-testid="unread-count"
              className="ml-1 rounded-full bg-primary px-1.5 text-xs text-surface"
            >
              {unread}
            </span>
          ) : null}
        </button>
      </header>

      {notificationsOpen ? (
        <section
          data-testid="notifications-panel"
          aria-label={es.notifications.title}
          className="border-b border-border bg-surface px-4 py-3"
        >
          {notifications.length === 0 ? (
            <EmptyReason
              testId="notifications-empty"
              reason="no_data_yet"
              title={es.notifications.emptyTitle}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.deepLink}
                    className="block rounded-lg px-3 py-2 hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                  >
                    {es.notifications.events[n.eventType]}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="flex">
        <nav
          aria-label={es.nav.menuLabel}
          className="hidden w-56 shrink-0 border-r border-border bg-surface p-3 lg:block"
        >
          <ul className="flex flex-col gap-0.5">
            {menu.map((destination) => (
              <li key={destination.key}>
                <Link
                  href={destination.href}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                >
                  {destination.label}
                  {destination.key === "agent" ? (
                    <span className="rounded bg-soft-surface px-1.5 py-0.5 text-xs text-text-secondary">
                      {es.nav.agentBadge}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id="contenido" aria-label={es.nav.mainLabel} className="min-w-0 flex-1 p-4 pb-24 lg:pb-4">
          {creates.length > 0 ? (
            <details data-testid="create-menu" className="mb-4">
              <summary className="inline-block cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-surface focus:outline focus:outline-2 focus:outline-cuotly-green">
                {es.create.label}
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {creates.map((option) => (
                  <li key={option.key}>
                    <Link
                      href={option.href}
                      className="block rounded-lg px-3 py-2 text-sm hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                    >
                      {option.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {children}
        </main>
      </div>

      <nav
        aria-label={es.nav.menuLabel}
        data-testid="mobile-nav"
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-border bg-surface lg:hidden"
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
      className="fixed inset-0 z-40 flex items-start justify-center bg-primary-dark/40 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-[20px] border border-border bg-surface p-4">
        <label htmlFor="busqueda-global" className="text-sm font-semibold">
          {es.search.title}
        </label>
        <input
          id="busqueda-global"
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={es.search.placeholder}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 focus:outline focus:outline-2 focus:outline-cuotly-green"
        />

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
          className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {es.common.close}
        </button>
      </div>
    </div>
  );
}
