import { Injectable, NgZone, signal } from '@angular/core';
import {
  loadTotpGuard,
  type TotpGuardSession,
  type TotpGuardState,
  type TotpGuardVerifyResponse,
} from './totp-guard';

@Injectable({ providedIn: 'root' })
export class TotpGuardService {
  readonly ready = signal(false);
  readonly unlocked = signal(false);
  readonly stateFailed = signal(false);
  readonly session = signal<TotpGuardSession | null>(null);

  private remoteUrl = '';
  private baseUrl = '';
  private storagePrefix = 'safe_totp';
  private token?: string;
  private stateUrl?: string;
  private stateMethod?: 'GET' | 'POST';
  private stateParams?: Record<string, unknown>;
  private verifyUrl?: string;
  private sessionPromise: Promise<TotpGuardSession> | null = null;
  private unsubscribe: (() => void) | null = null;
  private activeSession: TotpGuardSession | null = null;

  constructor(private ngZone: NgZone) {}

  configure(options: {
    remoteUrl: string;
    baseUrl: string;
    storagePrefix?: string;
    token?: string;
    stateUrl?: string;
    stateMethod?: 'GET' | 'POST';
    stateParams?: Record<string, unknown>;
    verifyUrl?: string;
  }): void {
    this.remoteUrl = options.remoteUrl;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.storagePrefix = options.storagePrefix ?? 'safe_totp';
    this.token = options.token;
    this.stateUrl = options.stateUrl;
    this.stateMethod = options.stateMethod;
    this.stateParams = options.stateParams;
    this.verifyUrl = options.verifyUrl;
  }

  async init(): Promise<void> {
    try {
      const session = await this.getSession();
      this.activeSession = session;
      this.session.set(session);
      this.setFromState(session.getState());
      this.unsubscribe?.();
      this.unsubscribe = session.onStateChange((state) =>
        this.ngZone.run(() => this.setFromState(state))
      );
      await session.init();
    } catch (err) {
      console.error('Failed to load TOTP guard:', err);
      this.ready.set(true);
      this.stateFailed.set(true);
    }
  }

  async retry(): Promise<void> {
    this.ready.set(false);
    this.stateFailed.set(false);
    try {
      const session = await this.getSession();
      await session.init();
    } catch (err) {
      console.error('TOTP guard retry failed:', err);
      this.ready.set(true);
      this.stateFailed.set(true);
    }
  }

  async verify(code: string): Promise<TotpGuardVerifyResponse> {
    const session = await this.getSession();
    return session.verify(code);
  }

  lock(): void {
    const session = this.activeSession;
    if (session) session.lock();
    // Clear the flag unconditionally so the gate re-renders even if the
    // session's state-change listeners were previously severed.
    this.unlocked.set(false);
  }

  private setFromState(state: TotpGuardState): void {
    this.ready.set(state.ready);
    this.unlocked.set(state.unlocked);
    this.stateFailed.set(state.stateFailed);
  }

  private getSession(): Promise<TotpGuardSession> {
    if (!this.sessionPromise) {
      this.sessionPromise = loadTotpGuard({
        remoteUrl: this.remoteUrl,
        baseUrl: this.baseUrl,
        storagePrefix: this.storagePrefix,
        token: this.token,
        stateUrl: this.stateUrl,
        stateMethod: this.stateMethod,
        stateParams: this.stateParams,
        verifyUrl: this.verifyUrl,
      })
        .then(({ session }) => session)
        .catch((err) => {
          this.sessionPromise = null;
          throw err;
        });
    }
    return this.sessionPromise;
  }
}