/** Fuera del archivo `"use server"` (`src/app/use-server-exports.test.ts`). */
export interface SpaceRequestValues {
  readonly businessName?: string;
  readonly contactName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly estimatedEstablishments?: number | string | null;
  readonly estimatedUsers?: number | string | null;
  readonly intendedUse?: string;
  readonly plan?: string;
  readonly taxName?: string;
  readonly taxId?: string;
  readonly taxAddress?: string;
}

export type SpaceRequestFormState = {
  readonly error: string | null;
  readonly saved: boolean;
  readonly submitted: boolean;
  /**
   * Lo escrito, cuando el servidor lo devuelve con un error: React 19 vacía
   * el formulario al enviarlo y sin esto se perdería.
   */
  readonly values: SpaceRequestValues | null;
};

export const INITIAL_SPACE_REQUEST_STATE: SpaceRequestFormState = {
  error: null,
  saved: false,
  submitted: false,
  values: null,
};
