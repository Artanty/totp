import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { PrismaClient } from './generated/prisma/client.js';
import { buildDatabaseUrl } from './lib/databaseUrl.js';
import logger from './lib/logger.js';
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

  const requestLogSkipPrefixes = [`${apiPrefix}/get-updates`];

  app.addHook('preHandler', async (request) => {
    try {
      if (requestLogSkipPrefixes.some((p) => request.url.startsWith(p))) return;
      logger.log(
        `HTTP ${request.method} ${request.url}`,
        {
          method: request.method,
          url: request.url,
          ip: request.ip,
          params: request.params,
          query: request.query,
          body: request.body,
          headers: request.headers,
        },
        'requestLogger'
      );
    } catch (err) {
      logger.error('request-logging hook failed', err);
    }
  });

  app.addHook('onError', async (request, _reply, error) => {
    logger.error(`HTTP ${request.method} ${request.url} failed`, error);
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ error: 'Not Found' });
  });

  app.get(`${apiPrefix}/get-updates`, async (_request, reply) => {
    const [log, error, start] = await Promise.all([
      logger.getLogs({ type: 'app' }),
      logger.getLogs({ type: 'error' }),
      logger.readLogFile('app.strat.log'),
    ]);
    const envs = Object.fromEntries(Object.keys(process.env).map((k) => [k, true]));
    return reply.send({
      version: process.env.TAG_VERSION,
      commit_message: process.env.COMMIT,
      project_id: process.env.PROJECT_ID,
      namespace: process.env.NAMESPACE,
      slave_repo: process.env.SLAVE_REPO,
      logs: { log, error, start },
      envs,
    });
  });

  return app;
}