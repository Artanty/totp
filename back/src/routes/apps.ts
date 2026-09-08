import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { encryptSecret } from '../lib/crypto.js';
import { buildOtpauthUri } from '../lib/otpauth.js';

interface CreateAppBody {
  name?: string;
  slug?: string;
}

type AppParams = { id?: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

async function uniqueSlug(app: FastifyInstance, base: string): Promise<string> {
  let slug = base || 'app';
  let suffix = 1;
  while (await app.prisma.app.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function uniqueGateEmail(app: FastifyInstance, slug: string): Promise<string> {
  const base = `${slug}.gate@totp.local`;
  let email = base;
  let suffix = 1;
  while (await app.prisma.user.findUnique({ where: { email } })) {
    email = `${slug}-${suffix}.gate@totp.local`;
    suffix += 1;
  }
  return email;
}

async function appRoutes(app: FastifyInstance): Promise<void> {
  const opts = { onRequest: [app.authenticate] };

  app.get('/', opts, async (request) => {
    const apps = await app.prisma.app.findMany({
      where: { adminId: request.user.id },
      orderBy: { createdAt: 'asc' },
    });
    return apps.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      gateEmail: `${a.slug}.gate@totp.local`,
      tokenId: a.tokenId,
      createdAt: a.createdAt,
    }));
  });

  app.post('/', opts, async (request, reply) => {
    const body = request.body as CreateAppBody | undefined;
    const name = body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }
    if (name.length > 191) {
      return reply.code(400).send({ error: 'name is too long' });
    }

    let slugBase: string;
    if (body?.slug !== undefined && body.slug !== null && body.slug !== '') {
      const raw = normalizeSlug(body.slug);
      if (!SLUG_RE.test(raw)) {
        return reply.code(400).send({ error: 'slug must be lowercase alphanumeric with dashes' });
      }
      slugBase = raw;
    } else {
      slugBase = normalizeSlug(name) || 'app';
    }

    const slug = await uniqueSlug(app, slugBase);
    const gateEmail = await uniqueGateEmail(app, slug);
    const gatePassword = generatePassword();

    const secret = randomBytes(20);
    const otpauthUri = buildOtpauthUri({
      issuer: 'totp',
      account: slug,
      secret,
    });

    const gateUser = await app.prisma.user.create({
      data: { email: gateEmail, passwordHash: await bcrypt.hash(gatePassword, 10) },
    });

    let token;
    let record;
    try {
      token = await app.prisma.token.create({
        data: {
          userId: gateUser.id,
          label: name,
          issuer: 'totp',
          account: slug,
          secretEnc: encryptSecret(secret),
        },
      });

      record = await app.prisma.app.create({
        data: {
          name,
          slug,
          adminId: request.user.id,
          gateUserId: gateUser.id,
          tokenId: token.id,
        },
      });
    } catch (err) {
      await app.prisma.user.delete({ where: { id: gateUser.id } }).catch(() => undefined);
      throw err;
    }

    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { width: 256, margin: 1 });

    return reply.code(201).send({
      app: { id: record.id, name, slug, gateEmail, tokenId: token.id },
      otpauthUri,
      qrDataUrl,
      integration: {
        totp_service_url: process.env.TOTP_SERVICE_URL ?? '',
        totp_service_user: gateEmail,
        totp_service_password: gatePassword,
        totp_token_id: token.id,
      },
    });
  });

  app.delete('/:id', opts, async (request, reply) => {
    const id = Number((request.params as AppParams).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'Invalid app id' });
    }

    const record = await app.prisma.app.findFirst({
      where: { id, adminId: request.user.id },
    });
    if (!record) return reply.code(404).send({ error: 'App not found' });

    await app.prisma.app.delete({ where: { id } });
    await app.prisma.user.delete({ where: { id: record.gateUserId } }).catch(() => undefined);

    return reply.code(204).send();
  });
}

export default appRoutes;