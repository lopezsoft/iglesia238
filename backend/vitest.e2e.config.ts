import { defineConfig } from 'vitest/config';
import { swcPlugin } from './vitest.config.js';

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    // Takes precedence over a local .env, so the tests always check the production defaults.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
      REDIS_URL: 'redis://localhost:6379',
      SWAGGER_ENABLED: 'false',
      LOG_LEVEL: 'error',
    },
  },
});
