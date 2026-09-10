import { attentionHeadline, type AttentionItem } from "@/core/establishments";
import { ATTENTION_ASPECT } from "@/components/home/AttentionList";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/*
 * El color del icono, medido y no elegido a ojo: AA pide 3:1 para lo que
 * no es texto, y sobre las superficies claras de la paleta dan 4,57:1
 * `danger`, 4,45:1 `info` y 4,95:1 el secundario.
 *
 * `warning` NO aparece, y no es un descuido: el ámbar de §20.6 da 2,55:1
 * sobre blanco y 2,36:1 sobre el fondo, así que no llega en NINGUNA
 * superficie clara del sistema. Subirlo exigiría un ámbar más oscuro, que
 * es un color de marca nuevo, y la paleta la fija el PRD. Lo que era
 * "warning" se pinta con `info`: el icono ya distingue el motivo por su
 * forma (§21.4) y el texto lo dice entero al lado, así que no se pierde
 * ninguna señal — se pierde solo un color que no se veía.
 *
 * Medido en `src/core/contrast.test.ts`, que además barre el código y
 * falla si el ámbar vuelve a colarse como color de primer plano en algún
 * componente. Por eso este comentario no escribe la clase con su nombre:
 * el barrido busca el literal, y encontrarlo aquí sería un falso positivo
 * — que es exactamente lo estricto que tiene que ser.
 */
const TONO: Readonly<Record<"danger" | "warning" | "info" | "neutral", string>> = {
  danger: "text-danger",
  warning: "text-info",
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
