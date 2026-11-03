import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Without DATABASE_URL, commands such as `prisma generate` must keep working (Docker build).
export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
