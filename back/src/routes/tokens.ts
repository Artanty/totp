import type { FastifyInstance } from 'fastify';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { parseOtpauthUri } from '../lib/otpauth.js';
import { totp, verifyTotp } from '../lib/totp.js';

interface CreateTokenBody {
  uri?: string;
}

interface VerifyTokenBody {
  code?: string;
}

type TokenParams = { id?: string };

async function tokenRoutes(app: FastifyInstance): Promise<void> {
  const opts = { onRequest: [app.authenticate] };

  app.get('/', opts, async (request) => {
    const tokens = await app.prisma.token.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'asc' },
    });
    return tokens.map((t) => ({
      id: t.id,
      label: t.label,
      issuer: t.issuer,
      account: t.account,
      algorithm: t.algorithm,
      digits: t.digits,
      period: t.period,
    }));
  });

  app.post('/', opts, async (request, reply) => {
    const body = request.body as CreateTokenBody | undefined;
    const uri = body?.uri;
    if (typeof uri !== 'string' || uri.trim().length === 0) {
      return reply.code(400).send({ error: 'uri is required' });
    }

    let parsed;
    try {
      parsed = parseOtpauthUri(uri.trim());
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid otpauth URI' });
    }

    if (parsed.type !== 'totp') {
      return reply.code(400).send({ error: 'Only totp URIs are supported for now' });
    }

    const token = await app.prisma.token.create({
      data: {
        userId: request.user.id,
        label: parsed.label,
        issuer: parsed.issuer,
        account: parsed.account,
        digits: parsed.digits,
        period: parsed.period,
        algorithm: parsed.algorithm,
        secretEnc: encryptSecret(parsed.secret),
      },
    });

    return reply.code(201).send({
      id: token.id,
      label: token.label,
      issuer: token.issuer,
      account: token.account,
    });
  });

  app.get('/:id/code', opts, async (request, reply) => {
    const id = Number((request.params as TokenParams).id);
    const token = await app.prisma.token.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!token) return reply.code(404).send({ error: 'Token not found' });

    const secret = decryptSecret(token.secretEnc);
    const now = Date.now();
    const code = totp(secret, {
      algorithm: token.algorithm as 'SHA1' | 'SHA256' | 'SHA512',
      digits: token.digits,
      period: token.period,
      time: now,
    });
    const expiresIn = token.period - (Math.floor(now / 1000) % token.period);

    return reply.send({ code, expiresIn });
  });

  app.post('/:id/verify', opts, async (request, reply) => {
    const id = Number((request.params as TokenParams).id);
    const body = request.body as VerifyTokenBody | undefined;
    const code = body?.code;
    if (typeof code !== 'string' || !/^\d+$/.test(code)) {
      return reply.code(400).send({ error: 'code is required and must be numeric' });
    }

    const token = await app.prisma.token.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!token) return reply.code(404).send({ error: 'Token not found' });

    const secret = decryptSecret(token.secretEnc);
    const valid = verifyTotp(code, secret, {
      algorithm: token.algorithm as 'SHA1' | 'SHA256' | 'SHA512',
      digits: token.digits,
      period: token.period,
      window: 1,
    });

    return reply.send({ valid });
  });

  app.delete('/:id', opts, async (request, reply) => {
    const id = Number((request.params as TokenParams).id);
    const token = await app.prisma.token.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!token) return reply.code(404).send({ error: 'Token not found' });

    await app.prisma.token.delete({ where: { id } });
    return reply.code(204).send();
  });
}

export default tokenRoutes;