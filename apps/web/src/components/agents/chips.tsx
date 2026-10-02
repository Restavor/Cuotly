import { Icon, type IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import type { ReservationOrigin } from "@/core/reservations/types";

/*
 * El origen de una reserva (PRD de agents §6.1 y §12.2). Es identidad, no estado:
 * cuatro colores propios, y NUNCA solo color — siempre icono y nombre (PRD §21.4).
 * El de la Web es rosa a propósito para que no se confunda con el verde de Restavor.
 *
 * Las clases van enteras, no montadas con plantillas: Tailwind solo genera las que
 * ve escritas.
 */
const ORIGIN_STYLE: Record<ReservationOrigin, { icon: IconName; className: string }> = {
  agent: { icon: "headset", className: "bg-origin-agent-bg text-origin-agent" },
  platform: { icon: "globe", className: "bg-origin-platform-bg text-origin-platform" },
  web: { icon: "window", className: "bg-origin-web-bg text-origin-web" },
  manual: { icon: "pencil", className: "bg-origin-manual-bg text-origin-manual" },
};

const SIZE_CLASS = {
  // 28 px de alto en tablet y 22 en móvil: el `chip-sm` de la maqueta.
  responsive: "h-[22px] gap-1 px-2 text-xs sm:h-7 sm:gap-1.5 sm:px-2.5 sm:text-[13px]",
  md: "h-7 gap-1.5 px-2.5 text-[13px]",
  sm: "h-[22px] gap-1 px-2 text-xs",
} as const;

/**
 * La insignia del origen: «Agente», «Plataforma» (con su nombre: «TheFork»,
 * «CoverManager»), «Web» o «Manual».
 */
export function OriginChip({
  origin,
  platformName,
  size = "responsive",
  muted = false,
}: {
  origin: ReservationOrigin;
  /** Solo para el origen `platform`: el nombre de la plataforma. */
  platformName?: string | null;
  size?: keyof typeof SIZE_CLASS;
  /** Una reserva cancelada baja el chip al 75 %. */
  muted?: boolean;
}) {
  const style = ORIGIN_STYLE[origin];
  const label = origin === "platform" && platformName ? platformName : es.agents.components.origins[origin];
  return (
    <span
      data-chip="origin"
      data-origin={origin}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold ${SIZE_CLASS[size]} ${style.className} ${
        muted ? "opacity-75" : ""
      }`}
    >
      <Icon name={style.icon} className="h-[15px] w-[15px] shrink-0" />
      {label}
    </span>
  );
}

export type ReservationStatusChipKind = "pending" | "duplicate" | "noShow";

const STATUS_STYLE: Record<ReservationStatusChipKind, string> = {
  pending: "bg-pending-bg text-pending-text",
  duplicate: "bg-pending-bg text-pending-text",
  noShow: "bg-status-muted text-surface",
};

/**
 * El estado de una reserva que se marca con insignia: Pendiente, Posible duplicada y
 * «No vino». Una reserva cancelada NO es una insignia: es una fila tachada.
 */
export function StatusChip({ kind }: { kind: ReservationStatusChipKind }) {
  return (
    <span
      data-chip="status"
      data-status={kind}
      className={`inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-xs font-semibold ${STATUS_STYLE[kind]}`}
    >
      {es.agents.components.statuses[kind]}
    </span>
  );
}

/** «Nueva»: la reserva que nadie ha abierto todavía. Va dentro del nombre, antes del texto. */
export function NewBadge() {
  return (
    <span
      data-badge="new"
      className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary-dark px-[7px] text-[11px] font-bold uppercase tracking-[0.05em] text-surface"
    >
      {es.agents.components.newBadge}
    </span>
  );
}
