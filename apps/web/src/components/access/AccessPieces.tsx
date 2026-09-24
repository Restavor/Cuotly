import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { contactMailto } from "@/core/contact";
import { es } from "@/i18n/es";

/*
 * Las piezas de la puerta de entrada (F01, A01 a A12), con las medidas
 * del diseño definitivo.
 *
 * Una nota de color que vale para todo el archivo: el diseño pinta en
 * naranja el icono y el texto de "Necesita información" y "En revisión".
 * El ámbar como color de texto no llega a 3:1 sobre blanco y `contrast.test.ts` lo
 * prohíbe en toda la aplicación, así que aquí el ámbar va de FONDO
 * (`bg-warning/25`) y el trazo del icono es el verde oscuro. El tono se
 * sigue leyendo por el fondo y por el texto de la insignia.
 */

export type AccessTone = "success" | "warning" | "danger";

const PILL: Record<AccessTone, string> = {
  success: "bg-success/15 text-text",
  warning: "bg-warning/20 text-text",
  danger: "bg-danger/15 text-text",
};

const HERO_CIRCLE: Record<AccessTone, string> = {
  success: "bg-success/15 text-primary",
  warning: "bg-warning/25 text-primary-dark",
  danger: "bg-danger/15 text-danger",
};

const HERO_ICON: Record<AccessTone, IconName> = {
  success: "tick",
  warning: "alert",
  danger: "close",
};

/** La etiqueta redonda de arriba a la izquierda: "Primer acceso", "Solicitud enviada"… */
export function AccessPill({ tone, children }: { tone?: AccessTone; children: ReactNode }) {
  const color = tone === undefined ? "bg-soft-surface text-primary-dark" : PILL[tone];
  return (
    <span className={`inline-flex rounded-full px-3.5 py-1 text-sm font-medium ${color}`}>
      {children}
    </span>
  );
}

/** A01 a A04 · el círculo grande con su icono, el título y la frase de debajo. */
export function StatusHero({
  tone,
  title,
  body,
}: {
  tone: AccessTone;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-4 flex items-start gap-5">
      <span
        aria-hidden="true"
        className={`flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full ${HERO_CIRCLE[tone]}`}
      >
        <Icon name={HERO_ICON[tone]} className="h-10 w-10" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 pt-1.5">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-text sm:text-[28px]">{title}</h1>
        <p className="mt-1 text-[17px] text-text-secondary">{body}</p>
      </div>
    </div>
  );
}

const BOX_ICON: Record<AccessTone | "review", { icon: IconName; tile: string }> = {
  review: { icon: "clock", tile: "text-primary-dark" },
  success: { icon: "check", tile: "text-primary" },
  warning: { icon: "alert", tile: "rounded-full bg-warning/25 text-primary-dark" },
  danger: { icon: "xCircle", tile: "text-danger" },
};

/** A01 a A04 · la caja "Estado de la solicitud" con su icono, su insignia y una frase. */
export function StatusBox({
  kind,
  badgeTone,
  badge,
  body,
}: {
  kind: AccessTone | "review";
  badgeTone: "success" | "warning" | "danger";
  badge: string;
  body: string;
}) {
  const { icon, tile } = BOX_ICON[kind];
  return (
    <section className="mt-6 rounded-[14px] border border-border p-5">
      <h2 className="text-[15px] font-semibold text-text">{es.auth.access.statusBoxTitle}</h2>
      <div className="mt-3 flex items-start gap-4">
        <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center ${tile}`}>
          <Icon name={icon} className="h-9 w-9" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <StatusBadge tone={badgeTone}>{badge}</StatusBadge>
          <p className="mt-2 text-[15px] text-text-secondary">{body}</p>
        </div>
      </div>
    </section>
  );
}

/** A02 y A04 · el mensaje del equipo o el motivo, entre comillas, sobre gris. */
export function QuoteBox({ label, text }: { label: string; text: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-[15px] font-semibold text-text">{label}</h2>
      <p className="mt-2 whitespace-pre-wrap rounded-[12px] border border-border bg-background px-5 py-4 text-[16px] text-text">
        “{text}”
      </p>
    </section>
  );
}

/** A01 a A04 · "Datos de tu solicitud", un dato por línea con su icono. */
export function RequestData({
  rows,
  compact = false,
}: {
  rows: readonly { icon: IconName; value: string }[];
  /** A02 · el diseño los pone en dos columnas, debajo de la respuesta. */
  compact?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-[15px] font-semibold text-text">{es.auth.access.yourData}</h2>
      <ul className={compact ? "mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2" : "mt-3 space-y-2.5"}>
        {rows.map((row) => (
          <li key={row.icon} className="flex items-center gap-4 text-[16px] text-text">
            <Icon name={row.icon} aria-hidden="true" className="h-6 w-6 shrink-0 text-text-secondary" />
            <span className="min-w-0 break-words">{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Un enlace que puede ser de la aplicación o un `mailto:` (el correo de
 * contacto de Cuotly). El segundo no pasa por el enrutador de Next.
 */
function AnyLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** El botón grande y lleno del diseño, como enlace. */
export function BigLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <AnyLink
      href={href}
      className="block w-full rounded-[10px] bg-primary px-4 py-3.5 text-center text-[17px] font-semibold text-surface transition-colors hover:bg-primary-dark focus:outline focus:outline-2 focus:outline-cuotly-green"
    >
      {children}
    </AnyLink>
  );
}

/** El mismo de contorno: "Ayuda" en A05. */
export function BigOutlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <AnyLink
      href={href}
      className="block w-full rounded-[10px] border border-border bg-surface px-4 py-3.5 text-center text-[17px] font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
    >
      {children}
    </AnyLink>
  );
}

/** A03 · "Contactar con Cuotly" como enlace subrayado, al lado del botón. */
export function ContactTextLink() {
  return (
    <a
      href={contactMailto()}
      className="inline-block text-[17px] font-semibold text-primary underline underline-offset-4 hover:text-primary-dark"
    >
      {es.auth.access.contactCuotly}
    </a>
  );
}

/**
 * F01 y A01 a A12 · la columna de la derecha: el documento, "¿Qué ocurre
 * después?" con los tres pasos, y abajo el candado con la nota de datos.
 * Es la misma en todas las vistas del formulario.
 */
export function WhatHappensNext() {
  const t = es.auth.access;
  return (
    <aside className="flex flex-col border-t border-border bg-soft-surface/60 px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:py-14">
      <Icon name="document" aria-hidden="true" className="h-[84px] w-[84px] text-primary-dark" strokeWidth={1.1} />
      <h2 className="mt-6 text-[20px] font-bold tracking-tight text-primary-dark sm:mt-8 sm:text-[28px]">{t.nextTitle}</h2>
      <ol className="mt-7 space-y-8">
        {t.nextSteps.map((step, i) => (
          <li key={step.title} className="flex gap-5">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-[15px] font-semibold text-primary-dark"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="text-[17px] font-semibold text-text">{step.title}</h3>
              <p className="mt-1 text-[15px] text-text-secondary">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-auto flex items-center gap-4 border-t border-border pt-6 text-sm text-text-secondary lg:mt-16">
        <Icon name="lock" aria-hidden="true" className="h-6 w-6 shrink-0 text-primary-dark" />
        {t.privacyNote}
      </p>
    </aside>
  );
}

/** F01 y A01 a A12 · la tarjeta de dos columnas: lo de cada vista a la izquierda. */
export function AccessCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-card border border-border bg-surface lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
      <div className="min-w-0 px-6 py-8 sm:px-10">{children}</div>
      <WhatHappensNext />
    </div>
  );
}

/**
 * A05 a A08 · la tarjeta centrada de los estados de acceso: el dibujo con
 * su insignia pequeña (un reloj, un aspa), el título grande, la frase y
 * los botones.
 */
export function StateCard({
  illustration,
  badge,
  title,
  body,
  children,
}: {
  illustration: IconName;
  badge: IconName;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto mt-6 max-w-[640px] rounded-card border border-border bg-surface px-5 py-8 text-center sm:px-16 sm:py-12">
      <span aria-hidden="true" className="relative mx-auto inline-flex text-primary-dark">
        <Icon name={illustration} className="h-16 w-16 sm:h-[104px] sm:w-[104px]" strokeWidth={1.1} />
        <span className="absolute -bottom-1 -right-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface sm:-right-5 sm:h-14 sm:w-14">
          <Icon name={badge} className="h-9 w-9 sm:h-14 sm:w-14" strokeWidth={1.3} />
        </span>
      </span>
      <h1 className="mt-5 text-[22px] font-bold leading-tight tracking-tight text-text sm:mt-8 sm:text-[30px]">{title}</h1>
      <p className="mx-auto mt-2 max-w-[440px] text-[15px] text-text-secondary sm:mt-3 sm:text-[18px]">{body}</p>
      <div className="mx-auto mt-6 max-w-[440px] space-y-3 sm:mt-8">{children}</div>
    </section>
  );
}

/**
 * A05 · "Volver al inicio" y, debajo, "Ayuda". Con sesión, el centro de
 * ayuda; sin ella el centro de ayuda no abre (pide entrar), así que
 * "Ayuda" escribe al correo de contacto de Cuotly (decisión 67).
 */
export function HomeAndHelp({ signedIn }: { signedIn: boolean }) {
  const t = es.auth.access;
  return (
    <>
      <BigLink href="/">{t.backHome}</BigLink>
      <BigOutlineLink href={signedIn ? "/ayuda" : contactMailto()}>{t.help}</BigOutlineLink>
    </>
  );
}
