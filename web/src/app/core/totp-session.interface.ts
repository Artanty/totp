export type TotpVerifyResponse = {
  valid: boolean;
  expiresAt?: string;
  nonce?: string;
  sessionTokenB?: string;
};

export type TotpSessionState = {
  ready: boolean;
  unlocked: boolean;
  stateFailed: boolean;
};

export type TotpSessionConfig = {
  baseUrl: string;
  storagePrefix?: string;
  sessionMs?: number;
  checkIntervalMs?: number;
  stateTimeoutMs?: number;
  stateRetries?: number;
  stateRetryDelayMs?: number;
  /** Bearer JWT sent as `Authorization` on every request (authenticated gate). */
  token?: string;
  /** State endpoint. Default `${baseUrl}/auth/totp/state`. */
  stateUrl?: string;
  /** State method. Default 'GET'. */
  stateMethod?: 'GET' | 'POST';
  /** JSON body sent with a POST state request (e.g. { tokenId }). */
  stateParams?: Record<string, unknown>;
  /** Verify endpoint. Default `${baseUrl}/auth/totp/verify`. */
  verifyUrl?: string;
};

export type TotpSession = {
  getState(): TotpSessionState;
  onStateChange(listener: (state: TotpSessionState) => void): () => void;
  init(): Promise<void>;
  retry(): void;
  verify(code: string): Promise<TotpVerifyResponse>;
  unlock(nonce?: string): void;
  lock(): void;
  dispose(): void;
};