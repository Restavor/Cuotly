/**
 * Estado inicial de las acciones de Ajustes, fuera del archivo
 * `"use server"` por el motivo de siempre: ese archivo solo puede exportar
 * funciones asíncronas, y una constante tira el módulo entero al evaluarlo
 * dejando todas sus acciones muertas sin decir nada
 * (`src/app/use-server-exports.test.ts` lo impide de vuelta).
 */

export type SettingsState = {
  readonly error: string | null;
  readonly done: boolean;
  /**
   * El servidor distingue "guardado" de "no había nada que guardar":
   * `set_space_name()` y `set_space_timezone()` devuelven `false` cuando el
   * valor ya era ese, y no escriben una fila de auditoría que diría "de X a
   * X". La pantalla lo cuenta tal cual en vez de fingir un cambio.
   */
  readonly unchanged: boolean;
};

export const INITIAL_SETTINGS: SettingsState = { error: null, done: false, unchanged: false };
