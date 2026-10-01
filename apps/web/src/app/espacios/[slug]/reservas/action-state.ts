/**
 * El estado del formulario de "Crear solicitud para este restaurante" vive
 * aquí y no junto a la acción: un archivo `"use server"` solo puede exportar
 * funciones asíncronas (`src/app/use-server-exports.test.ts`).
 */
export type ReservationRequestFormState = {
  error: string | null;
  done: boolean;
  /** Lo elegido, para que un error no vacíe el formulario (React 19 lo vacía al enviar). */
  establishmentId: string;
};

export const reservationRequestInitialState: ReservationRequestFormState = {
  error: null,
  done: false,
  establishmentId: "",
};
