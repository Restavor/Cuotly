/**
 * Estado inicial de la acción de la ficha, fuera del archivo `"use server"`
 * por el motivo de siempre: ese archivo solo puede exportar funciones
 * asíncronas, y una constante tira el módulo entero al evaluarlo dejando
 * su acción muerta sin decir nada (`src/app/use-server-exports.test.ts` lo
 * impide de vuelta).
 */

export type EstablishmentDataState = {
  readonly error: string | null;
  readonly done: boolean;
  /**
   * `set_establishment_data()` devuelve `false` cuando lo enviado ya era lo
   * guardado: no escribe ni fila ni apunte de auditoría (CA-17). La
   * pantalla lo cuenta tal cual en vez de decir "guardado" y fingir un
   * cambio que no ha ocurrido.
   */
  readonly unchanged: boolean;
};

export const INITIAL_ESTABLISHMENT_DATA: EstablishmentDataState = {
  error: null,
  done: false,
  unchanged: false,
};
