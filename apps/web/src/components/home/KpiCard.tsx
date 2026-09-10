import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * Uno de los tres números del resumen de §20.4.
 *
 * El número siempre es real y calculado en el servidor: esta tarjeta no
 * sabe redondear, estimar ni rellenar (CLAUDE.md MUST NOT). Cuando el dato
 * no se ha podido calcular —la consulta falló— `value` llega como `null` y
 * lo que se pinta es el motivo, nunca un cero: un cero diría "no hay
 * ninguno", que es una afirmación que en ese momento nadie puede hacer
 * (CA-20).
 *
 * `hint` es la letra pequeña que dice qué se está contando exactamente.
 * "Trabajos próximos a vencer" no significa nada sin decir según qué
 * plazo, y sin ella el número parecería una opinión.
 */
export function KpiCard({
  icon,
  tone,
  value,
  label,
  hint,
  href,
}: {
  icon: IconName;
  tone: "info" | "warning" | "danger";
  value: number | null;
  label: string;
  hint?: string;
  href: string;
}) {
  /*
    El circulo es un icono, y AA pide 3:1 para lo que no es texto. `info`
    da 3,62:1 y `danger` 3,69:1 sobre su tinte; el ambar da 2,15:1 y no
    llega, asi que el tono "warning" se pinta con `info`. No se aclara ni
    se oscurece la paleta: la fija el PRD §20.6 (CA-22, y la prueba que lo
    mide esta en `src/core/contrast.test.ts`).
  */
  const tones = {
    info: "bg-info/10 text-info",
    warning: "bg-info/10 text-info",
    danger: "bg-danger/10 text-danger",
  } as const;

  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-[20px] border border-border bg-surface p-5 transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
    >
      <span
        aria-hidden="true"
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}
      >
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0">
        {value === null ? (
          <span className="block text-sm font-semibold text-danger">
            {es.spaceHome.kpi.unavailable}
          </span>
        ) : (
          <span className="block text-3xl font-bold leading-tight text-primary-dark">{value}</span>
        )}
        <span className="block text-sm text-text">{label}</span>
        <span className="mt-0.5 block text-xs text-text-secondary">
          {value === null ? es.emptyReasons.error : hint}
        </span>
      </span>
    </Link>
  );
}
