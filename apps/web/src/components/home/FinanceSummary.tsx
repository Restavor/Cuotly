import { Icon, type IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

/**
 * Página 22 del diseño definitivo móvil · "Resumen financiero": lo cobrado
 * y lo que queda por cobrar en el mes en curso.
 *
 * Los dos importes llegan en **céntimos enteros** y se pintan con
 * `euros()`, el único sitio que divide por cien (decisión 7). Aquí no se
 * suma, ni se resta, ni se redondea nada: los calcula
 * `financial_dashboard()` sobre el libro inmutable de apuntes, y el
 * cliente nunca es la autoridad sobre un importe (CLAUDE.md MUST).
 *
 * Los dos nombres —"Cobrado" y "Pendiente de cobro"— se leen de
 * `es.space.finance`, los mismos que usa la pantalla de Finanzas: un
 * importe que se llama de dos maneras parece dos importes.
 */
function Importe({
  icon,
  tone,
  cents,
  label,
}: {
  readonly icon: IconName;
  readonly tone: "green" | "info";
  readonly cents: number;
  readonly label: string;
}) {
  /*
    El segundo tinte NO es el ámbar del diseño. El ámbar como color de
    primer plano sobre su propio tinte da 2,15:1 y AA pide 3:1 para un
    icono; el barrido de `src/core/contrast.test.ts` lo mide y lo prohíbe
    en cualquier componente —incluso escrito en un comentario, que es como
    saltó la primera vez—. Se usa `info` (3,62:1), que es lo mismo que hizo
    `KpiCard` con el recuadro ámbar de esta misma página. El verde sí pasa:
    3,78:1 sobre su propio tinte, medido en ese mismo barrido.

    Los dos colores salen de los tokens, nunca de un hexadecimal suelto
    (CLAUDE.md), y son decoración: quién es cada importe lo dice su
    etiqueta escrita debajo, que es lo que lee quien no los distinga
    (§21.4).
  */
  const tintes = {
    green: "bg-cuotly-green/10 text-cuotly-green",
    info: "bg-info/10 text-info",
  } as const;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${tintes[tone]}`}
      >
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xl font-bold leading-tight text-primary-dark">
          {euros(cents)}
        </span>
        <span className="block truncate text-xs text-text-secondary">{label}</span>
      </span>
    </div>
  );
}

export function FinanceSummary({
  collectedCents,
  pendingCents,
}: {
  readonly collectedCents: number;
  readonly pendingCents: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <Importe
        icon="finance"
        tone="green"
        cents={collectedCents}
        label={es.space.finance.collected}
      />
      <Importe
        icon="document"
        tone="info"
        cents={pendingCents}
        label={es.space.finance.outstanding}
      />
    </div>
  );
}
