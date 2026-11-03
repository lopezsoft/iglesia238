import { Module } from '@nestjs/common';
import { PrismaErrorTranslator } from './prisma-error.translator.js';
import { PrismaService } from './prisma.service.js';

@Module({
  providers: [PrismaService, PrismaErrorTranslator],
  exports: [PrismaService, PrismaErrorTranslator],
})
export class PrismaModule {}
