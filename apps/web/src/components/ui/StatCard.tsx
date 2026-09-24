import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

/**
 * La tarjeta de cifra del diseño: las cinco de arriba del Inicio (M01),
 * las tres de Finanzas (M16) y las tres de Informes (M18). Icono en su
 * cuadrado tintado y el rótulo al lado, el número grande debajo, y la
 * letra pequeña que dice qué se está contando.
 *
 * El número **siempre es real y calculado en el servidor**: esta tarjeta
 * no sabe redondear, estimar ni rellenar (CLAUDE.md MUST NOT). Cuando el
 * dato no se ha podido calcular, quien la pinta pasa el motivo en `value`
 * en vez de un cero, porque un cero afirma "no hay ninguno".
 *
 * Los tonos son los tres que pasan AA como icono sobre su propio tinte
 * (`src/core/contrast.test.ts`): el ámbar no llega y por eso no está.
 */
const TONOS = {
  green: "bg-cuotly-green/10 text-cuotly-green",
  info: "bg-info/10 text-info",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-soft-surface text-primary-dark",
} as const;

export type StatTone = keyof typeof TONOS;

export function StatCard({
  icon,
  tone = "green",
  label,
  value,
  hint,
  href,
  testId,
}: {
  icon: IconName;
  tone?: StatTone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Con destino, la tarjeta entera es un enlace a la pantalla que cuenta eso. */
  href?: string;
  testId?: string;
}) {
  const contenido = (
    <>
      <span className="flex flex-col items-start gap-1.5 min-[480px]:flex-row min-[480px]:items-center sm:gap-3">
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] sm:h-10 sm:w-10 ${TONOS[tone]}`}
        >
          <Icon name={icon} className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <span className="min-w-0 text-xs font-medium leading-snug text-text-secondary sm:text-sm">{label}</span>
      </span>
      <span className="mt-2 block text-[22px] font-bold leading-none tracking-tight text-primary-dark sm:mt-3 sm:text-[28px]">
        {value}
      </span>
      {hint === undefined || hint === null ? null : (
        <span className="mt-1.5 block text-xs leading-snug text-text-secondary sm:mt-2">{hint}</span>
      )}
    </>
  );

  const clase =
    // En el teléfono (P6 de docs/diseno/PLAN-MOVIL.md) la tarjeta se compacta
    // —menos margen, icono y cifra más pequeños— para que quepan dos o tres
    // por fila como en el diseño móvil, en vez de una columna de tarjetas
    // grandes. El texto no baja de 12 px (§21.4).
    "block min-w-0 rounded-card border border-border bg-surface p-3.5 shadow-sm transition-colors sm:p-5";

  if (href === undefined) {
    return (
      <div data-testid={testId} className={clase}>
        {contenido}
      </div>
    );
  }

  return (
    <Link
      href={href}
      data-testid={testId}
      className={`${clase} hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green`}
    >
      {contenido}
    </Link>
  );
}
