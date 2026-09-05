import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = () => {
  const user = env("DB_USERNAME");
  const pass = env("DB_PASSWORD");
  const host = env("DB_HOST");
  const name = env("DB_DATABASE");
  const port = process.env.DB_PORT ?? "3306";
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: databaseUrl(),
  },
});