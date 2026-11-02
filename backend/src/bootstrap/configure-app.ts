import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Environment } from '../config/environment.js';

export const API_PREFIX = 'api';
const SWAGGER_PATH = `${API_PREFIX}/docs`;

const STRICT_CSP = {
  directives: {
    defaultSrc: [`'none'`],
    frameAncestors: [`'none'`],
  },
};

// The Swagger UI needs inline scripts and styles. It is only served when explicitly enabled.
const SWAGGER_CSP = {
  directives: {
    defaultSrc: [`'self'`],
    styleSrc: [`'self'`, `'unsafe-inline'`],
    imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
    scriptSrc: [`'self'`, `'unsafe-inline'`],
  },
};

async function configureSecurity(
  app: NestFastifyApplication,
  config: ConfigService<Environment, true>,
): Promise<void> {
  const isSwaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });

  await app.register(helmet, {
    contentSecurityPolicy: isSwaggerEnabled ? SWAGGER_CSP : STRICT_CSP,
  });

  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
  });
}

function configureValidation(app: NestFastifyApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

function configureSwagger(
  app: NestFastifyApplication,
  config: ConfigService<Environment, true>,
): void {
  if (!config.get('SWAGGER_ENABLED', { infer: true })) {
    return;
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Church Management API')
      .setDescription('API multi-iglesia: membresía, secretaría y contabilidad')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}

/** Shared by main.ts and the e2e tests, so tests exercise the same setup that is deployed. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get<ConfigService<Environment, true>>(ConfigService);

  await configureSecurity(app, config);
  await app.register(compression, { encodings: ['gzip', 'deflate'] });
  app.setGlobalPrefix(API_PREFIX);
  configureValidation(app);
  configureSwagger(app, config);
  app.enableShutdownHooks();
}
