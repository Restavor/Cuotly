"use client";

import Link from "next/link";

import { productSwitchItems, type ProductAccess, type ProductKey } from "@/core/app/products";
import { es } from "@/i18n/es";
import { Icon, type IconName } from "@/components/ui/Icon";

import { useCloseDetailsOnLeave } from "./MobileContextCard";

const PRODUCT_ICONS: Readonly<Record<ProductKey, IconName>> = {
  app: "home",
  web: "monitor",
  agents: "sparkles",
};

/**
 * La marca de cada producto (decisión 88): "Restavor" a secas es solo la
 * puerta común; Restavor web y Restavor agents llevan su apellido.
 */
export function brandSuffix(product: ProductKey): string {
  return es.common.productSuffix[product];
}

/**
 * El logo del armazón, con el cambio de producto de `AppCambiarProducto`.
 *
 * En Restavor web y en Restavor agents, el logo abre un menú pequeño:
 * "Inicio de Restavor", "Restavor web" y "Restavor agents". Solo salen los
 * productos que la persona puede usar; lo que no tiene contratado sale como
 * «Contratar». Si no hay otro producto al que ir, o no se sabe (la consulta
 * falló), el logo es un enlace a la raíz del contexto, como siempre: un menú
 * con una sola opción es un gesto perdido.
 *
 * Es un `<details>` como el resto de desplegables del armazón: funciona sin
 * hidratación y `Escape` lo cierra (CA-22). El menú **no autoriza nada**:
 * cada destino lo vuelve a decidir el servidor.
 */
export function ProductLogo({
  product,
  access,
  homeHref,
  variant,
}: {
  product: ProductKey;
  access: ProductAccess | null;
  homeHref: string;
  variant: "sidebar" | "header";
}) {
  const desplegable = useCloseDetailsOnLeave();
  const suffix = brandSuffix(product);
  const items = access === null || product === "app" ? [] : productSwitchItems(access, product);
  const hayOtro = items.some((item) => item.key !== "app" && item.state !== "current");

  const marca =
    variant === "sidebar" ? (
      <>
        <span className="block text-2xl font-bold leading-none tracking-tight text-surface">
          {es.common.appName}
        </span>
        {suffix === "" ? null : (
          <span className="mt-1.5 block text-xs text-sidebar-text">{suffix}</span>
        )}
      </>
    ) : (
      <>
        <span className="block text-lg font-bold leading-none tracking-tight text-primary-dark">
          {es.common.appName}
        </span>
        {suffix === "" ? null : (
          <span className="mt-1 block text-[10px] leading-none text-text-secondary">{suffix}</span>
        )}
      </>
    );

  if (!hayOtro) {
    return (
      <Link
        href={homeHref}
        aria-label={`${es.common.appName}${suffix === "" ? "" : ` ${suffix}`} · ${es.nav.home}`}
        className={
          variant === "sidebar"
            ? "block rounded-lg focus:outline focus:outline-2 focus:outline-cuotly-green"
            : "shrink-0 rounded focus:outline focus:outline-2 focus:outline-cuotly-green lg:hidden"
        }
      >
        {marca}
      </Link>
    );
  }

  return (
    <details
      ref={desplegable}
      data-testid={variant === "sidebar" ? "product-switcher" : "product-switcher-mobile"}
      className={variant === "sidebar" ? "group relative" : "group relative shrink-0 lg:hidden"}
    >
      <summary
        aria-label={`${es.common.appName} ${suffix} · ${es.app.switcher.label}`}
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg focus:outline focus:outline-2 focus:outline-cuotly-green [&::-webkit-details-marker]:hidden"
      >
        <span className="block text-left">{marca}</span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 shrink-0 transition-transform group-open:rotate-180 ${
            variant === "sidebar" ? "text-sidebar-text" : "text-text-secondary"
          }`}
        />
      </summary>
      <ul
        role="menu"
        aria-label={es.app.switcher.label}
        className="absolute left-0 top-full z-40 mt-2 w-72 rounded-card border border-border bg-surface p-2 shadow-lg"
      >
        {items.map((item) => {
          const t = es.app.switcher[item.key];
          const here = item.state === "current";
          return (
            <li key={item.key} role="none">
              <Link
                href={item.href}
                role="menuitem"
                aria-current={here ? "page" : undefined}
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-text hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green ${
                  here ? "bg-soft-surface" : ""
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-soft-surface text-primary-dark">
                  <Icon name={PRODUCT_ICONS[item.key]} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.title}</span>
                  <span className="block text-xs text-text-secondary">
                    {here ? es.app.switcher.here : t.body}
                  </span>
                </span>
                {item.state === "contract" ? (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {es.app.switcher.contract}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
