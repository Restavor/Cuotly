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

const toneClasses: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  neutral: "bg-soft-surface text-text-secondary",
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
