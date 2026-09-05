import 'dotenv/config';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);

const app = buildApp();

async function start(): Promise<void> {
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();