export function buildDatabaseUrl(): string {
  const user = process.env.DB_USERNAME;
  const pass = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST;
  const name = process.env.DB_DATABASE;
  const port = process.env.DB_PORT ?? '3306';
  if (!user || !pass || !host || !name) {
    throw new Error(
      'Missing database env vars: DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD (DB_PORT optional)',
    );
  }
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}