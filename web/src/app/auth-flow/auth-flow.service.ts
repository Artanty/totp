import { Injectable, computed, signal } from '@angular/core';
import { AuthPhase, AUTH_DONE_EVENT } from './auth-flow';

/**
 * Tracks the app lifecycle: 'boot' -> 'auth' (auth UI shown) -> 'done' (app shown).
 * complete() dispatches window CustomEvent <AUTH_DONE_EVENT> on document so any
 * consumer can react to the moment the user is fully authenticated.
 */
@Injectable({ providedIn: 'root' })
export class AuthFlowService {
  private readonly phaseSignal = signal<AuthPhase>('boot');
  readonly phase = this.phaseSignal.asReadonly();
  readonly done = computed(() => this.phase() === 'done');

  complete(): void {
    if (this.done()) return;
    this.phaseSignal.set('done');
    document.dispatchEvent(new CustomEvent(AUTH_DONE_EVENT));
  }

  reset(): void {
    this.phaseSignal.set('boot');
  }
}