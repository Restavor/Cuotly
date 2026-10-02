"use client";

import { useEffect } from "react";

import { reservationCommandAction } from "../actions";

/**
 * Abrir la ficha de una reserva nueva le quita «Nueva» y lo deja en el historial (§6.1).
 * No pinta nada. Se hace al abrir en el navegador y no al renderizar en el servidor: una
 * página que se lee no debería cambiar nada, y un rastreador o una precarga no abre fichas.
 */
export function OpenMarker({ establishmentId, reservationId, date }: { establishmentId: string; reservationId: string; date: string }) {
  useEffect(() => {
    void reservationCommandAction({ establishmentId, reservationId, command: "open", date });
  }, [establishmentId, reservationId, date]);
  return null;
}
