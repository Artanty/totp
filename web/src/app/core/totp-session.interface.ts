export type TotpVerifyResponse = {
  valid: boolean;
  expiresAt?: string;
  nonce?: string;
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
