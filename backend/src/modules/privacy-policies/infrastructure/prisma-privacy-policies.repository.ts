import { Injectable } from '@nestjs/common';
import {
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  PolicyDraft,
  PolicyRecord,
  PrivacyPoliciesRepository,
} from '../application/ports/privacy-policies.repository.js';

const select = {
  id: true,
  denominationId: true,
  version: true,
  content: true,
  effectiveFrom: true,
  status: true,
  publishedAt: true,
  _count: { select: { dataConsents: true, membershipApplications: true } },
} as const;

type Row = {
  id: number;
  denominationId: number;
  version: string;
  content: string;
  effectiveFrom: Date;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: Date | null;
  _count: { dataConsents: number; membershipApplications: number };
};

function toRecord(row: Row): PolicyRecord {
  return {
    id: row.id,
    denominationId: row.denominationId,
    version: row.version,
    content: row.content,
    effectiveFrom: toIsoDate(row.effectiveFrom),
    status: row.status,
    publishedAt: row.publishedAt,
    consentCount: row._count.dataConsents,
    applicationCount: row._count.membershipApplications,
  };
}

@Injectable()
export class PrismaPrivacyPoliciesRepository implements PrivacyPoliciesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(denominationId: number): Promise<readonly PolicyRecord[]> {
    const rows = await this.prisma.privacyPolicy.findMany({
      where: { denominationId },
      select,
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async find(
    denominationId: number,
    id: number,
    transaction?: Transaction,
  ): Promise<PolicyRecord | null> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).privacyPolicy.findFirst({
      where: { id, denominationId },
      select,
    });
    return row ? toRecord(row) : null;
  }

  async versionExists(
    denominationId: number,
    version: string,
    exceptId: number | null,
    transaction?: Transaction,
  ): Promise<boolean> {
    const found = await clientOf(
      this.prisma,
      transaction,
    ).privacyPolicy.findFirst({
      where: {
        denominationId,
        version,
        ...(exceptId !== null ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    return found !== null;
  }

  async latestPublishedEffectiveFrom(
    denominationId: number,
    transaction?: Transaction,
  ): Promise<string | null> {
    const latest = await clientOf(
      this.prisma,
      transaction,
    ).privacyPolicy.findFirst({
      where: { denominationId, status: 'PUBLISHED' },
      orderBy: { effectiveFrom: 'desc' },
      select: { effectiveFrom: true },
    });
    return latest ? toIsoDate(latest.effectiveFrom) : null;
  }

  async create(
    denominationId: number,
    draft: PolicyDraft,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(
      this.prisma,
      transaction,
    ).privacyPolicy.create({
      data: {
        denominationId,
        version: draft.version,
        content: draft.content,
        effectiveFrom: parseIsoDate(draft.effectiveFrom),
        status: 'DRAFT',
      },
      select: { id: true },
    });
    return created.id;
  }

  async updateDraft(
    denominationId: number,
    id: number,
    draft: PolicyDraft,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).privacyPolicy.updateMany({
      where: { id, denominationId, status: 'DRAFT' },
      data: {
        version: draft.version,
        content: draft.content,
        effectiveFrom: parseIsoDate(draft.effectiveFrom),
      },
    });
    return result.count === 1;
  }

  async deleteDraft(
    denominationId: number,
    id: number,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).privacyPolicy.deleteMany({
      where: { id, denominationId, status: 'DRAFT' },
    });
    return result.count === 1;
  }

  async publish(
    denominationId: number,
    id: number,
    effectiveFrom: string,
    publishedAt: Date,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).privacyPolicy.updateMany({
      where: { id, denominationId, status: 'DRAFT' },
      data: {
        status: 'PUBLISHED',
        effectiveFrom: parseIsoDate(effectiveFrom),
        publishedAt,
      },
    });
    return result.count === 1;
  }
}
