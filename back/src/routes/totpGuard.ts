import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { decryptSecret } from '../lib/crypto.js';
import { verifyTotp } from '../lib/totp.js';
import {
  getGuardTokenId,
  TOTP_BOOT_NONCE,
  TOTP_GUARD_SESSION_MS,
} from '../lib/totpGuard.js';

const TOTP_CODE_RE = /^\d{6}$/;

interface IpBuckets {
  count: number;
  resetAt: number;
}

function makeRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, IpBuckets>();

  function check(ip: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  return check;
}

const RATE_LIMIT = Number(process.env.TOTP_GUARD_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = 60_000;
const checkRate = makeRateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

export default async function totpGuardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/state', async (_request, reply) => {
    return reply.send({ nonce: TOTP_BOOT_NONCE });
  });

  app.post('/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const rate = checkRate(request.ip);
    if (!rate.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(rate.retryAfterSec))
        .send({ error: 'Too many requests' });
    }

    const tokenId = getGuardTokenId();
    if (tokenId === null) {
      return reply.code(503).send({ error: 'TOTP guard is not configured' });
    }

    const body = request.body as { code?: unknown } | undefined;
    const code = body?.code;
    if (typeof code !== 'string' || !TOTP_CODE_RE.test(code)) {
      return reply.code(400).send({ error: 'code must be a 6-digit string' });
    }

    const token = await app.prisma.token.findUnique({
      where: { id: tokenId },
    });
    if (!token) {
      return reply.code(500).send({ error: 'TOTP token is not configured' });
    }

    const secret = decryptSecret(token.secretEnc);
    const valid = verifyTotp(code, secret, {
      algorithm: token.algorithm as 'SHA1' | 'SHA256' | 'SHA512',
      digits: token.digits,
      period: token.period,
      window: 1,
    });

    if (!valid) {
      return reply.code(401).send({ error: 'Invalid code' });
    }

    return reply.send({
      valid: true,
      expiresAt: new Date(Date.now() + TOTP_GUARD_SESSION_MS).toISOString(),
      nonce: TOTP_BOOT_NONCE,
    });
  });
}