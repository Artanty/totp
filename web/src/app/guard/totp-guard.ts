/**
 * Framework-agnostic TOTP guard loader. Copy this file into any project that
 * wants to embed the <safe-totp-gate> guard, plus install the single dependency
 * `@module-federation/runtime` (same runtime safe/web uses). The remote is a
 * classic webpack MF container (`var` library, no shared deps).
 *
 * Contract with the consumer's backend relay:
 *   GET  {baseUrl}/auth/totp/state  -> { nonce }
 *   POST {baseUrl}/auth/totp/verify { code } -> { valid, expiresAt?, nonce }
 */

import { init, loadRemote } from '@module-federation/runtime';

export type TotpGuardState = {
  ready: boolean;
  unlocked: boolean;
  stateFailed: boolean;
};

export type TotpGuardVerifyResponse = {
  valid: boolean;
  expiresAt?: string;
  nonce?: string;
};

export type TotpGuardSession = {
  getState(): TotpGuardState;
  onStateChange(listener: (state: TotpGuardState) => void): () => void;
  init(): Promise<void>;
  retry(): void;
  verify(code: string): Promise<TotpGuardVerifyResponse>;
  unlock(nonce?: string): void;
  lock(): void;
  dispose(): void;
};

export type TotpGuardOptions = {
  /** Base URL of the remote web app that serves remoteEntry.js. */
  remoteUrl: string;
  /** Base URL of the consumer's relay backend (/auth/totp/state|verify). */
  baseUrl: string;
  /** localStorage key prefix for the unlock session. Default 'safe_totp'. */
  storagePrefix?: string;
  /** Unique MF runtime name for this host application. Default 'totp-host'. */
  runtimeName?: string;
  /** Name of the remote container. Default 'totp'. */
  remoteName?: string;
};

type TotpCoreModule = {
  createTotpSession(config: { baseUrl: string; storagePrefix?: string }): TotpGuardSession;
};
type TotpGateModule = { registerTotpGate(): Promise<void> };

export async function loadTotpGuard(options: TotpGuardOptions): Promise<{ session: TotpGuardSession }> {
  const remoteName = options.remoteName ?? 'totp';
  const remoteUrl = options.remoteUrl.replace(/\/+$/, '');
  if (!remoteUrl) throw new Error('TOTP_URL is not configured');

  await init({
    name: options.runtimeName ?? 'totp-host',
    remotes: [{ name: remoteName, entry: `${remoteUrl}/remoteEntry.js`, type: 'var' }],
  });

  const [core, gate] = await Promise.all([
    loadRemote<TotpCoreModule>(`${remoteName}/totp-core`),
    loadRemote<TotpGateModule>(`${remoteName}/totp-gate`),
  ]);
  if (!core || !gate || typeof gate.registerTotpGate !== 'function') {
    throw new Error('Federated TOTP modules are unavailable');
  }

  await gate.registerTotpGate();
  const session = core.createTotpSession({
    baseUrl: options.baseUrl,
    storagePrefix: options.storagePrefix,
  });
  return { session };
}