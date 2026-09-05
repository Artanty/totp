import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import type { AuthUser } from '../plugins/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CredentialsBody {
  email?: string;
  password?: string;
}

function validateCredentials(body: CredentialsBody): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required';
  const { email, password } = body;
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) return 'Valid email is required';
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (request, reply) => {
    const body = request.body as CredentialsBody | undefined;
    const error = validateCredentials(body ?? {});
    if (error) return reply.code(400).send({ error });

    const existing = await app.prisma.user.findUnique({ where: { email: body!.email! } });
    if (existing) return reply.code(409).send({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(body!.password!, 10);
    const user = await app.prisma.user.create({ data: { email: body!.email!, passwordHash } });

    const authUser: AuthUser = { id: user.id, email: user.email };
    const token = app.jwt.sign(authUser);
    return reply.code(201).send({ token, user: authUser });
  });

  app.post('/login', async (request, reply) => {
    const body = request.body as CredentialsBody | undefined;
    const error = validateCredentials(body ?? {});
    if (error) return reply.code(400).send({ error });

    const user = await app.prisma.user.findUnique({ where: { email: body!.email! } });
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(body!.password!, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

    const authUser: AuthUser = { id: user.id, email: user.email };
    const token = app.jwt.sign(authUser);
    return reply.send({ token, user: authUser });
  });
}

export default authRoutes;