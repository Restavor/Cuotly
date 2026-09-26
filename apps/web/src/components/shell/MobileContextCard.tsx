"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * Un contexto al que se puede saltar desde la tarjeta de móvil: un espacio
 * de mantenimiento o un panel de restaurante. Los arma el layout del
 * espacio con `my_contexts()`, la misma función que el Inicio global y
 * "Restaurantes" (RN-GLO-03): tres listas de "mis contextos" que un día
 * dirían cosas distintas serían peor que una.
 */
export interface ShellContext {
  readonly key: string;
  readonly kind: "space" | "panel";
  readonly name: string;
  /** El rol en el espacio, o "Panel de restaurante". */
  readonly detail: string;
  readonly href: string;
}

/**
 * El `<details>` de un selector de contexto se cierra solo al cambiar de
 * ruta y al tocar fuera. Hace falta porque el armazón vive en el layout y
 * no se desmonta al navegar: sin esto, el desplegable seguiría abierto en
 * la pantalla de destino. Lo comparten la tarjeta de móvil y la caja del
 * menú lateral de escritorio.
 */
export function useCloseDetailsOnLeave() {
  const pathname = usePathname();
  const desplegable = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (desplegable.current) desplegable.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const fuera = (event: PointerEvent) => {
      const d = desplegable.current;
      if (d?.open && !d.contains(event.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, []);

  return desplegable;
}

/**
 * La lista del desplegable: todos tus contextos, separados como en
 * "Restaurantes" —Mantenimiento (los espacios) y Restaurantes (los
 * paneles)—, con el actual marcado. Es la misma en móvil y en escritorio:
 * dos listas de "mis contextos" que un día dirían cosas distintas serían
 * peor que una.
 */
export function ContextPickerList({
  currentHref,
  contexts,
}: {
  currentHref: string;
  contexts: readonly ShellContext[];
}) {
  const t = es.nav.contextPicker;
  const espacios = contexts.filter((c) => c.kind === "space");
  const paneles = contexts.filter((c) => c.kind === "panel");

  const grupo = (titulo: string, filas: readonly ShellContext[]) =>
    filas.length === 0 ? null : (
      <div>
        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {titulo}
        </p>
        <ul className="flex flex-col gap-0.5">
          {filas.map((c) => {
            const actual = c.href === currentHref;
            return (
              <li key={c.key}>
                <Link
                  href={c.href}
                  aria-current={actual ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-field px-2 py-2 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
                    actual ? "bg-cuotly-green/10 font-semibold text-primary-dark" : "text-text hover:bg-soft-surface"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.name}</span>
                    <span className="block truncate text-[11px] font-normal text-text-secondary">
                      {c.detail}
                    </span>
                  </span>
                  {actual ? <Icon name="check" className="h-4 w-4 shrink-0 text-cuotly-green" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <>
      {grupo(t.maintenance, espacios)}
      {grupo(t.restaurants, paneles)}
    </>
  );
}

/**
 * Móvil (página 22 del diseño) · la tarjeta de contexto bajo la cabecera.
 *
 * A la izquierda, dónde estás. Tocarla despliega **todos** tus contextos,
 * separados como en "Restaurantes": Mantenimiento (los espacios) y
 * Restaurantes (los paneles), y desde ahí se cambia sin pasar por el
 * Inicio global. A la derecha, "Volver al inicio global", que lleva a `/`.
 *
 * Con un solo contexto —el que ya estás mirando— no hay desplegable: un
 * `<details>` de un elemento promete algo que no hay (el mismo criterio
 * que RN-PAN-05). Si `my_contexts()` falla, se cae ahí también, y el botón
 * de la derecha sigue llevando a donde se elige.
 *
 * Es un `<details>` por la misma razón que el selector del panel: funciona
 * sin hidratación y con teclado. Como el armazón vive en el layout y no se
 * desmonta al navegar, se cierra al cambiar de ruta y al tocar fuera.
 */
export function MobileContextCard({
  name,
  detail,
  currentHref,
  contexts,
}: {
  name: string;
  detail: string;
  currentHref: string;
  contexts: readonly ShellContext[];
}) {
  const t = es.nav.contextPicker;
  const desplegable = useCloseDetailsOnLeave();

  const hayOtros = contexts.some((c) => c.href !== currentHref);

  const identidad = (
    <span className="flex min-w-0 items-center gap-2 rounded-field border border-border bg-surface px-2.5 py-2 transition-colors group-open:border-cuotly-green">
      <Icon name="building" className="h-5 w-5 shrink-0 text-primary-dark" />
      <span aria-hidden="true" className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">{name}</span>
        <span className="block truncate text-[11px] text-text-secondary">{detail}</span>
      </span>
      {hayOtros ? (
        <Icon
          name="chevronDown"
          className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180"
        />
      ) : null}
    </span>
  );

  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-1.5">
      {hayOtros ? (
        <details ref={desplegable} className="group min-w-0">
          <summary
            aria-label={`${name} · ${detail} · ${t.open}`}
            className="h-full cursor-pointer list-none rounded-field focus:outline focus:outline-2 focus:outline-cuotly-green [&::-webkit-details-marker]:hidden"
          >
            {identidad}
          </summary>
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[60vh] overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-lg">
            <ContextPickerList currentHref={currentHref} contexts={contexts} />
          </div>
        </details>
      ) : (
        <div className="min-w-0" aria-label={`${name} · ${detail}`}>
          {identidad}
        </div>
      )}
      <Link
        href="/"
        className="flex max-w-[8.5rem] items-center gap-1.5 rounded-field border border-cuotly-green/15 bg-cuotly-green/10 px-2.5 py-2 text-xs font-medium leading-tight text-primary-dark transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        <Icon name="home" className="h-3.5 w-3.5 shrink-0" />
        {t.backToGlobal}
      </Link>
    </div>
  );
}
