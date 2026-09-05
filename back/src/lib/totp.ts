import { createHmac } from 'node:crypto';

export type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface OTPOptions {
  algorithm?: TOTPAlgorithm;
  digits?: number;
}

export interface TOTPOptions extends OTPOptions {
  period?: number;
  time?: number;
}

// RFC 4226 — HMAC-based One-Time Password
export function hotp(secret: Buffer, counter: number, options: OTPOptions = {}): string {
  const algorithm = options.algorithm ?? 'SHA1';
  const digits = options.digits ?? 6;

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac(algorithm, secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

// RFC 6238 — Time-based One-Time Password
export function totp(secret: Buffer, options: TOTPOptions = {}): string {
  const period = options.period ?? 30;
  const time = options.time ?? Date.now();
  const counter = Math.floor(time / 1000 / period);
  return hotp(secret, counter, options);
}

export interface VerifyOptions extends TOTPOptions {
  window?: number;
}

export function verifyTotp(code: string, secret: Buffer, options: VerifyOptions = {}): boolean {
  const period = options.period ?? 30;
  const window = options.window ?? 1;
  const counter = Math.floor(Date.now() / 1000 / period);

  if (!/^\d+$/.test(code)) return false;

  for (let i = counter - window; i <= counter + window; i++) {
    if (hotp(secret, i, options) === code) return true;
  }
  return false;
}