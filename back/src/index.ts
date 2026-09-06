import 'dotenv/config';
import { buildApp } from './app.js';
import logger from './lib/logger.js';

const port = Number(process.env.PORT ?? 3000);

const app = buildApp();


async function start(): Promise<void> {
  const service_started_at = new Date().toISOString();
  console.log('[START] ' + service_started_at.replace('T', ' ').split('.')[0]);
  try {
    await app.listen({ port, host: '0.0.0.0' });
    logger.log(`Server is running on port ${port}`);
    logger.logToFile('app.strat.log', 'startup', { service_started_at, port }, 'log', 'startup');
  } catch (err) {
    logger.error('server failed to start', err);
    app.log.error(err);
    process.exit(1);
  }
}

void start();

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});