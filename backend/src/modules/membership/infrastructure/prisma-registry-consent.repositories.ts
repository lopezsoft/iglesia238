import { Injectable } from '@nestjs/common';
import {
  parseIsoDate,
  toIsoDate,
  toIsoDateOrNull,
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  ConsentRow,
  ConsentView,
  CongregationRef,
  CurrentRegistryEntry,
  MemberRegistryView,
  MemberStatus,
  PrivacyPolicyRef,
} from '../application/member.models.js';
import type {
  ConsentRepository,
  NewConsentRecord,
  NewRegistryEntry,
  NewTransferRecord,
  RegistryRepository,
} from '../application/ports/member-details.repositories.js';
import { displayName, formatMemberCode } from '../application/person-text.js';

const congregationSelect = {
  id: true,
  name: true,
  code: true,
  isActive: true,
  municipality: { select: { code: true } },
} as const;

@Injectable()
export class PrismaRegistryRepository implements RegistryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async view(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberRegistryView> {
    const where = { memberId, denominationId: scope.denominationId };
    const [entries, transfers, history] = await Promise.all([
      this.prisma.memberRegistryEntry.findMany({
        where,
        include: { congregation: { select: { name: true, code: true } } },
        orderBy: [{ startedOn: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.memberTransfer.findMany({
        where,
        include: {
          originCongregation: { select: { name: true } },
          destinationCongregation: { select: { name: true } },
        },
        orderBy: [{ transferDate: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.memberStatusHistory.findMany({
        where,
        include: { user: { select: { displayName: true } } },
        orderBy: [{ startedOn: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        congregationId: entry.congregationId,
        congregationName: entry.congregation.name,
        memberNumber: entry.memberNumber,
        code: formatMemberCode(entry.congregation.code, entry.memberNumber),
        registryBook: entry.registryBook,
        registryFolio: entry.registryFolio,
        startedOn: toIsoDate(entry.startedOn),
        endedOn: toIsoDateOrNull(entry.endedOn),
      })),
      transfers: transfers.map((transfer) => ({
        id: transfer.id,
        originName: transfer.originCongregation.name,
        destinationName:
          transfer.externalDestinationName ??
          transfer.destinationCongregation?.name ??
          '—',
        isExternal: transfer.destinationCongregationId === null,
        status: transfer.status,
        transferDate: toIsoDate(transfer.transferDate),
        notes: transfer.notes,
      })),
      statusHistory: history.map((row) => ({
        id: row.id,
        status: row.status,
        startedOn: toIsoDate(row.startedOn),
        reason: row.reason,
        changedBy: row.user?.displayName ?? null,
      })),
    };
  }

  async currentEntry(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<CurrentRegistryEntry | null> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).memberRegistryEntry.findFirst({
      where: { memberId, denominationId: scope.denominationId, endedOn: null },
      orderBy: { id: 'desc' },
    });
    return row
      ? {
          id: row.id,
          congregationId: row.congregationId,
          memberNumber: row.memberNumber,
          startedOn: toIsoDate(row.startedOn),
        }
      : null;
  }

  async openEntry(
    scope: TenantScope,
    entry: NewRegistryEntry,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(
      this.prisma,
      transaction,
    ).memberRegistryEntry.create({
      data: {
        denominationId: scope.denominationId,
        memberId: entry.memberId,
        congregationId: entry.congregationId,
        memberNumber: entry.memberNumber,
        startedOn: parseIsoDate(entry.startedOn),
        registryBook: entry.registryBook,
        registryFolio: entry.registryFolio,
      },
      select: { id: true },
    });
    return created.id;
  }

  async closeCurrentEntry(
    scope: TenantScope,
    memberId: number,
    endedOn: string,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).memberRegistryEntry.updateMany({
      where: { memberId, denominationId: scope.denominationId, endedOn: null },
      data: { endedOn: parseIsoDate(endedOn) },
    });
  }

  async addStatusHistory(
    scope: TenantScope,
    entry: {
      memberId: number;
      status: MemberStatus;
      startedOn: string;
      reason: string | null;
      userId: number | null;
    },
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).memberStatusHistory.create({
      data: {
        denominationId: scope.denominationId,
        memberId: entry.memberId,
        status: entry.status,
        startedOn: parseIsoDate(entry.startedOn),
        reason: entry.reason,
        userId: entry.userId,
      },
    });
  }

  async findCongregation(
    scope: TenantScope,
    congregationId: number,
    transaction?: Transaction,
  ): Promise<CongregationRef | null> {
    const row = await clientOf(this.prisma, transaction).congregation.findFirst(
      {
        where: {
          id: congregationId,
          denominationId: scope.denominationId,
          deletedAt: null,
        },
        select: congregationSelect,
      },
    );
    return row ? this.toRef(row) : null;
  }

  async listDestinations(
    scope: TenantScope,
    exceptCongregationId: number,
  ): Promise<CongregationRef[]> {
    const rows = await this.prisma.congregation.findMany({
      where: {
        denominationId: scope.denominationId,
        deletedAt: null,
        isActive: true,
        id: { not: exceptCongregationId },
      },
      select: congregationSelect,
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toRef(row));
  }

  async addTransfer(
    scope: TenantScope,
    record: NewTransferRecord,
    transaction: Transaction,
  ): Promise<number> {
    const now = new Date();
    const created = await clientOf(
      this.prisma,
      transaction,
    ).memberTransfer.create({
      data: {
        denominationId: scope.denominationId,
        memberId: record.memberId,
        originCongregationId: record.originCongregationId,
        destinationCongregationId: record.destinationCongregationId,
        externalDestinationName: record.externalDestinationName,
        status: 'COMPLETED',
        transferDate: parseIsoDate(record.transferDate),
        approvedById: record.approvedById,
        approvedAt: now,
        notes: record.notes,
      },
      select: { id: true },
    });
    return created.id;
  }

  private toRef(row: {
    id: number;
    name: string;
    code: string;
    isActive: boolean;
    municipality: { code: string | null } | null;
  }): CongregationRef {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      municipalityCode: row.municipality?.code ?? null,
      isActive: row.isActive,
    };
  }
}

@Injectable()
export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: TenantScope, personId: number): Promise<ConsentView[]> {
    const rows = await this.prisma.dataConsent.findMany({
      where: { personId, denominationId: scope.denominationId },
      include: {
        policy: { select: { version: true, effectiveFrom: true } },
        guardian: true,
      },
      orderBy: { grantedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      policyVersion: row.policy.version,
      policyEffectiveFrom: toIsoDateOrNull(row.policy.effectiveFrom),
      channel: row.channel,
      grantedAt: toIsoDateTime(row.grantedAt),
      revokedAt: toIsoDateTimeOrNull(row.revokedAt),
      guardianName: row.guardian ? displayName(row.guardian) : null,
    }));
  }

  async find(
    scope: TenantScope,
    personId: number,
    consentId: number,
    transaction?: Transaction,
  ): Promise<ConsentRow | null> {
    const row = await clientOf(this.prisma, transaction).dataConsent.findFirst({
      where: { id: consentId, personId, denominationId: scope.denominationId },
      select: { id: true, personId: true, revokedAt: true },
    });
    return row
      ? {
          id: row.id,
          personId: row.personId,
          revokedAt: toIsoDateTimeOrNull(row.revokedAt),
        }
      : null;
  }

  countInForce(
    scope: TenantScope,
    personId: number,
    transaction?: Transaction,
  ): Promise<number> {
    return clientOf(this.prisma, transaction).dataConsent.count({
      where: {
        personId,
        denominationId: scope.denominationId,
        revokedAt: null,
      },
    });
  }

  countAll(scope: TenantScope, personId: number): Promise<number> {
    return this.prisma.dataConsent.count({
      where: { personId, denominationId: scope.denominationId },
    });
  }

  async revoke(
    scope: TenantScope,
    consentId: number,
    revokedAt: Date,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).dataConsent.updateMany({
      where: {
        id: consentId,
        denominationId: scope.denominationId,
        revokedAt: null,
      },
      data: { revokedAt },
    });
  }

  async currentPolicy(
    scope: TenantScope,
    today: string,
  ): Promise<PrivacyPolicyRef | null> {
    const policy = await this.prisma.privacyPolicy.findFirst({
      where: {
        denominationId: scope.denominationId,
        status: 'PUBLISHED',
        effectiveFrom: { lte: parseIsoDate(today) },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      select: { id: true, version: true },
    });
    return policy;
  }

  async grant(
    scope: TenantScope,
    record: NewConsentRecord,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(this.prisma, transaction).dataConsent.create(
      {
        data: {
          denominationId: scope.denominationId,
          personId: record.personId,
          guardianId: record.guardianId,
          policyId: record.policyId,
          channel: record.channel,
          grantedAt: record.grantedAt,
        },
        select: { id: true },
      },
    );
    return created.id;
  }
}
