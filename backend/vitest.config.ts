import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export const swcPlugin = swc.vite({
  module: { type: 'es6' },
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
    target: 'es2023',
  },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'prisma/tools/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/**/*.module.ts', 'src/**/*.spec.ts'],
    },
  },
});
