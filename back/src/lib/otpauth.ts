import type { TOTPAlgorithm } from './totp.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export interface OtpauthData {
  type: 'totp' | 'hotp';
  label: string;
  account: string | null;
  issuer: string | null;
  secret: Buffer;
  algorithm: TOTPAlgorithm;
  digits: number;
  period: number;
  counter: number | null;
}

export function parseOtpauthUri(uri: string): OtpauthData {
  const match = /^otpauth:\/\/(totp|hotp)\/([^?]+)(?:\?(.*))?$/.exec(uri);
  if (!match) throw new Error('Invalid otpauth:// URI');

  const type = match[1] as OtpauthData['type'];
  const label = decodeURIComponent(match[2]);
  const params = new URLSearchParams(match[3] ?? '');

  const secretParam = params.get('secret');
  if (!secretParam) throw new Error('Missing secret parameter');
  const secret = base32Decode(secretParam);
  if (secret.length === 0) throw new Error('Secret is empty');

  const issuerParam = params.get('issuer');
  const colonIdx = label.indexOf(':');
  const prefixIssuer = colonIdx >= 0 ? label.slice(0, colonIdx) : null;
  const issuer = issuerParam ?? prefixIssuer;
  const account = colonIdx >= 0 ? label.slice(colonIdx + 1) : label;

  const algorithmRaw = params.get('algorithm') ?? 'SHA1';
  const digitsRaw = Number(params.get('digits') ?? 6);
  const periodRaw = Number(params.get('period') ?? 30);
  const counterRaw = type === 'hotp' ? Number(params.get('counter') ?? 0) : null;

  return {
    type,
    label,
    account,
    issuer: issuer ?? null,
    secret,
    algorithm: algorithmRaw.toUpperCase() as TOTPAlgorithm,
    digits: digitsRaw,
    period: periodRaw,
    counter: counterRaw,
  };
}