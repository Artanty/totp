import { randomUUID } from 'node:crypto';

export const TOTP_BOOT_NONCE = randomUUID();

export const TOTP_GUARD_SESSION_MS = 12 * 60 * 60 * 1000;

export function getGuardTokenId(): number | null {
  const id = Number(process.env.TOTP_TOKEN_ID ?? NaN);
  return Number.isInteger(id) && id > 0 ? id : null;
}