import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ERROR_TRANSLATORS } from './common/errors/error-translator.port.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { validateEnvironment } from './config/environment.js';
import { PrismaErrorTranslator } from './infrastructure/prisma/prisma-error.translator.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';

/** Composition root: the only place that wires ports to concrete infrastructure. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggingModule,
    PrismaModule,
    HealthModule,
  ],
  providers: [
    {
      provide: ERROR_TRANSLATORS,
      useFactory: (prisma: PrismaErrorTranslator) => [prisma],
      inject: [PrismaErrorTranslator],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
