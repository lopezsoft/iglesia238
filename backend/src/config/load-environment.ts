import { existsSync } from 'node:fs';

// Imported first by main.ts: ESM evaluates it before AppModule, so the validation in main.ts
// reports the real rule when a value in .env is invalid. Docker images have no .env file.
const ENV_FILE = '.env';

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}
