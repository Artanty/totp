import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { PrismaClient } from './generated/prisma/client.js';
import { buildDatabaseUrl } from './lib/databaseUrl.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import tokenRoutes from './routes/tokens.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}


export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  const prisma = new PrismaClient({ datasourceUrl: buildDatabaseUrl() });

  app.decorate('prisma', prisma);
  app.register(authPlugin);

  const apiPrefix = process.env.API_PREFIX ?? '/totp';
  app.register(authRoutes, { prefix: `${apiPrefix}/auth` });
  app.register(tokenRoutes, { prefix: `${apiPrefix}/tokens` });

  return app;
}