import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { decryptSecret } from '../lib/crypto.js';
import { verifyTotp } from '../lib/totp.js';
import { TOTP_GUARD_SESSION_MS } from '../lib/totpGuard.js';

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

interface InitBody {
  tokenId?: unknown;
}

interface VerifyBody {
  code?: unknown;
  nonce?: unknown;
}

function parseTokenId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function totpGuardRoutes(app: FastifyInstance): Promise<void> {
  const opts = { onRequest: [app.authenticate] };

  app.post('/init', opts, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as InitBody | undefined;
    const requestedTokenId = parseTokenId(body?.tokenId);

    let tokenId: number;
    if (requestedTokenId !== null) {
      const token = await app.prisma.token.findFirst({
        where: { id: requestedTokenId, userId: request.user.id },
      });
      if (token) {
        tokenId = token.id;
      } else {
        const adminApp = await app.prisma.app.findFirst({
          where: { adminId: request.user.id, tokenId: requestedTokenId },
        });
        if (!adminApp) {
          return reply.code(404).send({ error: 'Token not found' });
        }
        tokenId = adminApp.tokenId;
      }
    } else {
      const gateApp = await app.prisma.app.findUnique({
        where: { gateUserId: request.user.id },
      });
      if (!gateApp) {
        return reply.code(404).send({ error: 'No gate token configured for this account' });
      }
      tokenId = gateApp.tokenId;
    }

    const session = await app.prisma.gateSession.create({
      data: {
        userId: request.user.id,
        tokenId,
        nonce: randomUUID(),
        state: 'pending',
        expiresAt: new Date(Date.now() + TOTP_GUARD_SESSION_MS),
      },
    });

    return reply.send({
      gateSessionId: session.id,
      nonce: session.nonce,
      expiresAt: session.expiresAt.toISOString(),
    });
  });

  app.post('/verify', opts, async (request: FastifyRequest, reply: FastifyReply) => {
    const rate = checkRate(request.ip);
    if (!rate.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(rate.retryAfterSec))
        .send({ error: 'Too many requests' });
    }

    const body = request.body as VerifyBody | undefined;
    const code = body?.code;
    const nonce = body?.nonce;
    if (typeof code !== 'string' || !TOTP_CODE_RE.test(code)) {
      return reply.code(400).send({ error: 'code must be a 6-digit string' });
    }
    if (typeof nonce !== 'string' || nonce.length === 0) {
      return reply.code(400).send({ error: 'nonce is required' });
    }

    const session = await app.prisma.gateSession.findUnique({ where: { nonce } });
    if (!session || session.userId !== request.user.id) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      return reply.code(410).send({ error: 'Session expired' });
    }

    const token = await app.prisma.token.findUnique({ where: { id: session.tokenId } });
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

    await app.prisma.gateSession.update({
      where: { id: session.id },
      data: { state: 'verified' },
    });

    return reply.send({
      valid: true,
      expiresAt: new Date(Date.now() + TOTP_GUARD_SESSION_MS).toISOString(),
      nonce: session.nonce,
    });
  });
}