export type TeamMenuActionState = {
  readonly error: string | null;
  readonly done: boolean;
  readonly notice: string | null;
};

export const INITIAL_TEAM_MENU_ACTION: TeamMenuActionState = { error: null, done: false, notice: null };
