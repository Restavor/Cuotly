export type MenuActionState = { readonly error: string | null; readonly done: boolean; readonly notice: string | null };

export const INITIAL_MENU_ACTION: MenuActionState = { error: null, done: false, notice: null };
