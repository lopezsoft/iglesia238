import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { HealthIndicator } from '../application/health-indicator.port.js';

@Injectable()
export class RedisHealthIndicator implements HealthIndicator {
  readonly name = 'redis';

  constructor(private readonly redis: RedisService) {}

  async check(): Promise<void> {
    await this.redis.client.ping();
  }
}
