import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { AUDIT_LOG_READER } from './application/audit-logs.ports.js';
import {
  GetAuditFilterOptionsUseCase,
  ListAuditLogsUseCase,
} from './application/audit-logs.use-cases.js';
import { PrismaAuditLogReader } from './infrastructure/prisma-audit-log.reader.js';
import { AuditLogsController } from './presentation/audit-logs.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuditLogsController],
  providers: [
    ListAuditLogsUseCase,
    GetAuditFilterOptionsUseCase,
    { provide: AUDIT_LOG_READER, useClass: PrismaAuditLogReader },
  ],
})
export class AuditLogsModule {}
