import type { MenuVersionContent } from "@/core/menu-diff";

/**
 * A17 · cuando alguien guardó mientras escribías, el servidor rechaza con
 * `EDICION_SIMULTANEA` y la pantalla necesita DOS cosas para poder enseñar
 * la comparación: qué número de versión hay ahora y qué dice. Las dos
 * vuelven aquí, porque la versión nueva se creó después de que esta
 * pantalla se pintara y el navegador no la tiene.
 */
export interface MenuEditConflict {
  readonly version: number;
  readonly content: MenuVersionContent;
}

export type MenuActionState = {
  readonly error: string | null;
  readonly done: boolean;
  readonly notice: string | null;
  readonly conflict?: MenuEditConflict | null;
};

export const INITIAL_MENU_ACTION: MenuActionState = { error: null, done: false, notice: null };
