import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';
import { Environment } from '../../config/environment.js';

const MAX_RETRIES_PER_REQUEST = 2;

/** Redis supports rate limiting across instances, so a failure must not take the API down. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(
    config: ConfigService<Environment, true>,
    private readonly logger: SmartLogger,
  ) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
    });
    this.client.on('error', (error: Error) =>
      this.logger.warn(`Redis error: ${error.message}`, RedisService.name),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
    await Promise.resolve();
  }
}
