import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.TOTP_MASTER_KEY;
  if (!secret) throw new Error('TOTP_MASTER_KEY is not set');
  const key = Buffer.from(secret, 'hex');
  if (key.length !== 32) {
    throw new Error('TOTP_MASTER_KEY must be 64 hex chars (32 bytes)');
  }
  cachedKey = key;
  return key;
}

export interface EncryptedPayload {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

export function encryptSecret(input: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(stored: string): Buffer {
  const [iv, tag, ciphertext] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}