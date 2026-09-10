export type PriorityState = { readonly error: string | null; readonly done: boolean };

export const INITIAL_PRIORITY: PriorityState = { error: null, done: false };
