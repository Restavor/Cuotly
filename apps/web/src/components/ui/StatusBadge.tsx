import type { ReactNode } from "react";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  tone: Tone;
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
export function StatusBadge({ tone, children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
      {children}
    </span>
  );
}
