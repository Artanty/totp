import { Injectable } from '@angular/core';
import {
  TotpSession,
  TotpSessionConfig,
  TotpSessionState,
  TotpVerifyResponse,
} from './totp-session.interface';

export type { TotpSession, TotpSessionConfig, TotpSessionState, TotpVerifyResponse };

const DEFAULT_SESSION_MS = 60 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_STATE_TIMEOUT_MS = 60_000;
const DEFAULT_STATE_RETRIES = 3;
const DEFAULT_STATE_RETRY_DELAY_MS = 5_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createTotpSession(config: TotpSessionConfig): TotpSession {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const prefix = config.storagePrefix ?? 'safe_totp';
  const unlockedAtKey = `${prefix}_unlocked_at`;
  const nonceKey = `${prefix}_unlocked_nonce`;
  const sessionMs = config.sessionMs ?? DEFAULT_SESSION_MS;
  const checkIntervalMs = config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  const stateTimeoutMs = config.stateTimeoutMs ?? DEFAULT_STATE_TIMEOUT_MS;
  const stateRetries = config.stateRetries ?? DEFAULT_STATE_RETRIES;
  const stateRetryDelayMs =
    config.stateRetryDelayMs ?? DEFAULT_STATE_RETRY_DELAY_MS;

  const listeners = new Set<(state: TotpSessionState) => void>();
  const state: TotpSessionState = {
    ready: false,
    unlocked: false,
    stateFailed: false,
  };
  let watchdog: ReturnType<typeof setInterval> | undefined;

  const emit = () => {
    const snapshot: TotpSessionState = { ...state };
    listeners.forEach((cb) => cb(snapshot));
  };

  const readString = (key: string): string => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };

  const readNumber = (key: string): number => {
    try {
      const num = Number(localStorage.getItem(key) ?? 0);
      return Number.isFinite(num) ? num : 0;
    } catch {
      return 0;
    }
  };

  const clearSession = () => {
    try {
      localStorage.removeItem(unlockedAtKey);
      localStorage.removeItem(nonceKey);
    } catch {
      /* ignore storage errors */
    }
  };

  const checkExpiry = () => {
    const savedAt = readNumber(unlockedAtKey);
    if (savedAt > 0 && Date.now() - savedAt >= sessionMs) {
      lock();
    }
  };

  function startWatchdog() {
    stopWatchdog();
    watchdog = setInterval(checkExpiry, checkIntervalMs);
    document.addEventListener('visibilitychange', checkExpiry);
  }

  function stopWatchdog() {
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = undefined;
    }
    document.removeEventListener('visibilitychange', checkExpiry);
  }

  async function fetchWithTimeout(
    url: string,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        credentials: 'same-origin',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchWithRetry(
    url: string,
    retries: number,
    delayMs: number,
    timeoutMs: number,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetchWithTimeout(url, timeoutMs);
      } catch (err) {
        lastError = err;
        if (attempt < retries) await sleep(delayMs);
      }
    }
    throw lastError;
  }

  async function init(): Promise<void> {
    try {
      const response = await fetchWithRetry(
        `${baseUrl}/auth/totp/state`,
        stateRetries,
        stateRetryDelayMs,
        stateTimeoutMs,
      );
      const data = (await response.json()) as { nonce?: string };
      const nonce = readString(nonceKey);
      const savedAt = readNumber(unlockedAtKey);
      const valid =
        !!data.nonce &&
        nonce === data.nonce &&
        savedAt > 0 &&
        Date.now() - savedAt < sessionMs;
      if (!valid) clearSession();
      state.unlocked = valid;
      state.stateFailed = false;
      if (valid) startWatchdog();
    } catch (err) {
      console.error('Failed to check TOTP session state:', err);
      clearSession();
      state.unlocked = false;
      state.stateFailed = true;
    } finally {
      state.ready = true;
      emit();
    }
  }

  function retry(): void {
    state.stateFailed = false;
    state.ready = false;
    emit();
    void init();
  }

  async function verify(code: string): Promise<TotpVerifyResponse> {
    const response = await fetch(`${baseUrl}/auth/totp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const error = new Error(
        `TOTP verify failed: ${response.status}`,
      ) as Error & { status?: number; error?: unknown };
      error.status = response.status;
      try {
        error.error = (await response.json()) as unknown;
      } catch {
        /* ignore malformed body */
      }
      throw error;
    }
    return (await response.json()) as TotpVerifyResponse;
  }

  function unlock(nonce?: string): void {
    try {
      localStorage.setItem(unlockedAtKey, String(Date.now()));
      if (nonce) localStorage.setItem(nonceKey, nonce);
    } catch {
      /* ignore storage errors */
    }
    state.unlocked = true;
    emit();
    startWatchdog();
  }

  function lock(): void {
    stopWatchdog();
    clearSession();
    state.unlocked = false;
    emit();
  }

  function dispose(): void {
    stopWatchdog();
    listeners.clear();
  }

  return {
    getState: () => ({ ...state }),
    onStateChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    init,
    retry,
    verify,
    unlock,
    lock,
    dispose,
  };
}
