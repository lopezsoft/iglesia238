import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { RedisModule } from '../../infrastructure/redis/redis.module.js';
import { HEALTH_INDICATORS } from './application/health-indicator.port.js';
import { HealthService } from './application/health.service.js';
import { PrismaHealthIndicator } from './infrastructure/prisma.health-indicator.js';
import { RedisHealthIndicator } from './infrastructure/redis.health-indicator.js';
import { HealthController } from './presentation/health.controller.js';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    PrismaHealthIndicator,
    RedisHealthIndicator,
    {
      provide: HEALTH_INDICATORS,
      useFactory: (
        database: PrismaHealthIndicator,
        redis: RedisHealthIndicator,
      ) => [database, redis],
      inject: [PrismaHealthIndicator, RedisHealthIndicator],
    },
  ],
})
export class HealthModule {}
