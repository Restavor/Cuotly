import { attentionHeadline, type AttentionItem } from "@/core/establishments";
import { ATTENTION_ASPECT } from "@/components/home/AttentionList";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

const TONO: Readonly<Record<"danger" | "warning" | "info" | "neutral", string>> = {
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
  neutral: "text-text-secondary",
};

/**
 * La columna "Necesita atención" del listado (§20.2): el motivo más
 * urgente que tiene el restaurante, cuántos hay de ese motivo, y cuántos
 * quedan por debajo.
 *
 * Sin nada pendiente NO se deja la celda en blanco: se dice "Sin
 * pendientes" con su icono. Una celda vacía se lee como "no se ha podido
 * calcular", que es otra cosa (CA-20).
 *
 * §21.4 · el estado va con texto e icono, nunca solo con color: en blanco
 * y negro, la marca de verificación y el aviso siguen distinguiéndose.
 */
export function AttentionCell({ items }: { items: readonly AttentionItem[] }) {
  const resumen = attentionHeadline(items);
  const t = es.teamArea.establishments;

  if (resumen === null) {
    return (
      <span className="flex items-center gap-2 text-sm text-text-secondary">
        <Icon name="check" className="h-[18px] w-[18px] shrink-0 text-success" />
        {t.noAttention}
      </span>
    );
  }

  const aspecto = ATTENTION_ASPECT[resumen.kind];

  return (
    <span className="flex items-center gap-2 text-sm text-text">
      <Icon name={aspecto.icon} className={`h-[18px] w-[18px] shrink-0 ${TONO[aspecto.tone]}`} />
      <span className="min-w-0">
        {t.attentionHeadline[resumen.kind](resumen.count)}
        {resumen.others > 0 ? (
          <span className="block text-xs text-text-secondary">
            {t.attentionOthers(resumen.others)}
          </span>
        ) : null}
      </span>
    </span>
  );
}
