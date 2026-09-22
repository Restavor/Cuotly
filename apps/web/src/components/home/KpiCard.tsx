import { StatCard, type StatTone } from "@/components/ui/StatCard";
import type { IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * Uno de los cinco números del resumen de §20.4, con la pinta de la
 * página 22 del diseño definitivo (M01): icono tintado y rótulo en la
 * misma fila, el número grande debajo y la letra pequeña al pie. La
 * figura la pone `StatCard`; aquí solo se decide qué va en cada hueco.
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
  tone: "info" | "warning" | "danger" | "green";
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
  const tono: StatTone = tone === "warning" ? "info" : tone;

  return (
    <StatCard
      icon={icon}
      tone={tono}
      label={label}
      href={href}
      value={
        value === null ? (
          <span className="text-base font-semibold text-danger">{es.spaceHome.kpi.unavailable}</span>
        ) : (
          value
        )
      }
      hint={value === null ? es.emptyReasons.error : hint}
    />
  );
}
