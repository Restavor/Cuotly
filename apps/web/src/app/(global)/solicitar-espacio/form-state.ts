/** Fuera del archivo `"use server"` (`src/app/use-server-exports.test.ts`). */
export type SpaceRequestFormState = {
  readonly error: string | null;
  readonly saved: boolean;
  readonly submitted: boolean;
};

export const INITIAL_SPACE_REQUEST_STATE: SpaceRequestFormState = {
  error: null,
  saved: false,
  submitted: false,
};
