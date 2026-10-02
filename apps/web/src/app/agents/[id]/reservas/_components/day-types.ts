import type { OriginFilter } from "@/core/reservations/agenda";
import type { CapacityState } from "@/core/reservations/capacity";
import type { ReservationOrigin, ReservationStatus } from "@/core/reservations/types";

/** Una fila de Hoy ya preparada por el servidor: lo justo para pintarla, con los textos redactados. */
export interface DayRowData {
  readonly id: string;
  readonly time: string;
  readonly name: string;
  readonly note: string | null;
  readonly partySize: number;
  readonly origin: ReservationOrigin;
  readonly platformName: string | null;
  readonly status: ReservationStatus;
  readonly isNew: boolean;
  readonly duplicate: boolean;
  readonly largeGroup: boolean;
  readonly cancelledNote: string | null;
  /** La otra reserva del par si es una posible duplicada. */
  readonly duplicatePartnerId: string | null;
  readonly href: string;
}

export interface DayBlockData {
  readonly key: string;
  /** `null` = «Fuera de turno». */
  readonly shift: { readonly name: string; readonly range: string; readonly capacity: number } | null;
  readonly occupied: number;
  readonly state: CapacityState | null;
  readonly rows: readonly DayRowData[];
}

export type DayCounters = Readonly<Record<OriginFilter, number>>;
