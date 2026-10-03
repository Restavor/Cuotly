import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import type { ReservationOrigin, ReservationStatus } from "@/core/reservations/types";

import { NewBadge, OriginChip, StatusChip } from "./chips";

/**
 * Una fila de la agenda (PRD de agents §6.1, `HojaReservas` y `AgentsHoy`): hora,
 * nombre y nota, personas y origen. Va dentro de una `<ul>`.
 *
 * Es presentación pura: recibe todo ya decidido. Qué filas hay, en qué orden y qué
 * botones llevan lo decide la agenda (Fase C) y, por detrás, el servidor.
 *
 *  - **Pendiente** (un grupo grande por confirmar) y **posible duplicada** van en una
 *    caja amarilla con una segunda línea para sus botones (`actions`).
 *  - **Cancelada** no es una insignia: la hora y el nombre van tachados, en gris, con la
 *    nota «Cancelada por X · hora» y el origen al 75 %.
 *  - **No vino** es una insignia gris.
 */
export function ReservationRow({
  time,
  name,
  note,
  partySize,
  origin,
  platformName,
  status,
  isNew = false,
  duplicate = false,
  largeGroup = false,
  cancelledNote,
  actions,
  href,
  id,
}: {
  time: string;
  name: string;
  note?: string | null;
  partySize: number;
  origin: ReservationOrigin;
  platformName?: string | null;
  status: ReservationStatus;
  isNew?: boolean;
  /** `duplicate_flag = 'possible'`. */
  duplicate?: boolean;
  /** Un grupo por encima del umbral: «Grupo grande». */
  largeGroup?: boolean;
  /** «Cancelada por Carmen · 14:20», ya redactado. */
  cancelledNote?: string;
  /** Los botones de una fila pendiente o duplicada: «Rechazar» y «Confirmar», «No es duplicada»… */
  actions?: ReactNode;
  /** A dónde lleva la fila (la ficha de la reserva). Sin él, la fila no es un enlace. */
  href?: string;
  /** El ancla de la fila: «Revisar» lleva a ella. */
  id?: string;
}) {
  const t = es.agents.components;
  const cancelled = status === "cancelled";
  const noShow = status === "no_show";
  const boxed = (status === "pending" || duplicate) && !cancelled;
  const gray = cancelled || noShow;

  const line = (
    <div className="flex min-h-[46px] items-center gap-3 py-[5px]">
      <span
        className={`w-12 shrink-0 text-base font-bold tabular-nums ${cancelled ? "text-status-muted line-through" : ""} ${
          noShow ? "text-status-muted" : ""
        }`}
      >
        {time}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {isNew ? <NewBadge /> : null}
          <span
            className={`text-[15px] font-semibold [overflow-wrap:anywhere] ${
              cancelled ? "text-status-muted line-through" : ""
            } ${noShow ? "text-status-muted" : ""}`}
          >
            {name}
          </span>
          {noShow ? <StatusChip kind="noShow" /> : null}
          {status === "pending" && !cancelled ? <StatusChip kind="pending" /> : null}
          {duplicate && !cancelled ? <StatusChip kind="duplicate" /> : null}
          {largeGroup && !cancelled ? (
            <span className="text-xs font-semibold text-text-secondary">{t.largeGroup}</span>
          ) : null}
        </span>
        {cancelled && cancelledNote ? (
          <span className="block text-[13px] text-status-muted">{cancelledNote}</span>
        ) : note ? (
          <span className={`block text-[13px] ${gray ? "text-status-muted" : "text-text-secondary"}`}>{note}</span>
        ) : null}
      </span>

      <span
        className={`flex shrink-0 items-center gap-1 text-[15px] font-semibold tabular-nums ${
          gray ? "text-status-muted" : ""
        }`}
      >
        <Icon name="person" className="hidden h-4 w-4 sm:block" />
        <span aria-hidden="true">{partySize}</span>
        <span className="sr-only">{t.people(partySize)}</span>
      </span>

      <OriginChip origin={origin} platformName={platformName} muted={cancelled} />
    </div>
  );

  const content = href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-cuotly-green">
      {line}
    </Link>
  ) : (
    line
  );

  if (!boxed) {
    return (
      <li id={id} className={`rounded-xl px-3 ${href ? "hover:bg-soft-surface" : ""}`}>
        {content}
      </li>
    );
  }

  return (
    <li
      id={id}
      data-row="pending"
      className="scroll-mt-24 rounded-xl border border-pending-border bg-pending-row px-3 pb-2 pt-1.5"
    >
      {content}
      {actions ? <div className="flex flex-wrap justify-end gap-2 sm:pl-[60px]">{actions}</div> : null}
    </li>
  );
}
