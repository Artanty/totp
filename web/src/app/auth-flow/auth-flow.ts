/**
 * Shared auth lifecycle contract (copy-friendly: drop this folder into any
 * Angular app). Pre-app phase ('auth') renders the auth-feature; once the
 * user is fully authenticated the app calls complete() -> phase becomes
 * 'done' and a window-level AUTH_DONE CustomEvent is dispatched, after which
 * the real app is shown.
 */
export type AuthPhase = 'boot' | 'auth' | 'done';

export const AUTH_DONE_EVENT = 'AUTH_DONE';