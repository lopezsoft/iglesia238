import { Injectable } from '@nestjs/common';
import {
  AuditEntry,
  AuditRecorder,
} from '../../common/audit/audit-recorder.port.js';
import { Transaction } from '../../common/persistence/transaction.js';
import { Prisma } from '../../generated/prisma/client.js';
import { clientOf } from './prisma-transaction.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaAuditRecorder implements AuditRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, transaction?: Transaction): Promise<void> {
    await clientOf(this.prisma, transaction).auditLog.create({
      data: {
        userId: entry.actor.userId,
        denominationId: entry.denominationId ?? entry.actor.denominationId,
        congregationId: entry.congregationId ?? entry.actor.congregationId,
        entity: entry.entity,
        entityId: String(entry.entityId),
        action: entry.action,
        changes: entry.changes
          ? (entry.changes as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
}
