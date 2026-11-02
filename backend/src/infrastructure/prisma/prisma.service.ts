import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';
import { Environment } from '../../config/environment.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { parseMariaDbUrl } from './mariadb-connection.js';

/** Infrastructure only: repositories are the sole consumers allowed to inject this service. */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    config: ConfigService<Environment, true>,
    private readonly logger: SmartLogger,
  ) {
    const databaseUrl = config.get('DATABASE_URL', { infer: true });
    super({ adapter: new PrismaMariaDb(parseMariaDbUrl(databaseUrl)) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established', PrismaService.name);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed', PrismaService.name);
  }
}
