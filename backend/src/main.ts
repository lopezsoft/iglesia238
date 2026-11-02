import './config/load-environment.js';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp } from './bootstrap/configure-app.js';
import { SmartLogger } from './common/logging/smart-logger.service.js';
import { Environment, validateEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  // The adapter is created before the DI container exists, so the environment is read here.
  const environment = validateEnvironment(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: environment.BODY_LIMIT_BYTES,
      trustProxy: environment.TRUST_PROXY,
    }),
    { bufferLogs: true },
  );

  const logger = app.get(SmartLogger);
  app.useLogger(logger);

  await configureApp(app);

  const port = app
    .get<ConfigService<Environment, true>>(ConfigService)
    .get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port} under /${API_PREFIX}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet, and a failed start must be visible and exit with an error.
  process.stderr.write(
    `Failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
