/**
 * RN-EST-20 · el estado de los formularios de grupos. Vive aquí y no junto
 * a las acciones porque un archivo `"use server"` solo puede exportar
 * funciones asíncronas (`src/app/use-server-exports.test.ts`).
 *
 * `moved` distingue "se movió" de "ya estaba ahí": mover adonde ya está no
 * hace nada, y decir "movido" sería mentir.
 */
export type GroupActionState = {
  readonly error: string | null;
  readonly done: boolean;
  readonly moved?: boolean;
  readonly keptAsEditor?: number;
  readonly lostAccess?: number;
};

export const INITIAL_GROUP_ACTION: GroupActionState = { error: null, done: false };

/** Lo que se hace con quien entraba por el grupo de origen (RN-EST-20). */
export const PREVIOUS_ACCESS_CHOICES = ["keep_as_editor", "revoke"] as const;
export type PreviousAccessChoice = (typeof PREVIOUS_ACCESS_CHOICES)[number];

export function isPreviousAccessChoice(value: unknown): value is PreviousAccessChoice {
  return typeof value === "string" && (PREVIOUS_ACCESS_CHOICES as readonly string[]).includes(value);
}
