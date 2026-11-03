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
      // Fake secret: the e2e tests sign their own tokens with it.
      JWT_SECRET: 'e2e-test-secret-with-at-least-32-characters-long',
      JWT_EXPIRATION: '15m',
      REFRESH_TTL: '7d',
      APP_BASE_URL: 'http://localhost:4200',
      SWAGGER_ENABLED: 'false',
      LOG_LEVEL: 'error',
    },
  },
});
