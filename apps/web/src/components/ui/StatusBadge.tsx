import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  tone: Tone;
  /**
   * Un icono en vez del punto. §21.4 pide que el estado se exprese "con
   * texto e icono y no solo con color": el punto cumple lo mínimo —hay
   * algo además del color— pero un icono con forma propia distingue un
   * aviso de un reloj sin depender de verlos en color.
   */
  icon?: IconName;
  children: ReactNode;
};

/*
 * El fondo lleva el color del tono; el TEXTO, no.
 *
 * Ponía `text-success` sobre `bg-success/10`, y los cuatro tonos se
 * quedaban por debajo de AA para texto normal: medidos, success 3,78:1,
 * warning 2,33:1, danger 4,01:1 e info 3,92:1, contra los 4,5:1 que pide
 * CA-22. El fallo no lo veía nadie porque `contrast.test.ts` comprobaba la
 * PALETA —`success` contra blanco— y no la mezcla que pinta el navegador:
 * `bg-success/10` no es `success`, es otro color, y el contraste entre los
 * dos es mucho menor que contra blanco.
 *
 * El comentario de aquel test decía además que "los badges de estado usan
 * superficie suave con el color de texto principal, que sí cumple". No era
 * verdad: es lo que este cambio hace por fin. Sexta vez en el proyecto que
 * una garantía escrita en un comentario resulta no estar implementada.
 *
 * Con `text-text` sobre el mismo tinte se pasa de 2,33:1 a 15,09:1 en el
 * peor caso, y el tono sigue distinguiéndose por el fondo y por el punto.
 */
const toneClasses: Record<Tone, string> = {
  success: "bg-success/10 text-text",
  warning: "bg-warning/10 text-text",
  danger: "bg-danger/10 text-text",
  info: "bg-info/10 text-text",
  neutral: "bg-soft-surface text-text",
};

const dotClasses: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-text-secondary",
};

/**
 * Insignia de estado. El color nunca es la única señal (PRD §21.4): siempre
 * lleva el texto del estado al lado, nunca solo un punto de color.
 */
export function StatusBadge({ tone, icon, children }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {icon === undefined ? (
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
      ) : (
        <Icon name={icon} className="h-3.5 w-3.5" />
      )}
      {children}
    </span>
  );
}
