import { Injectable } from '@nestjs/common';
import {
  parseIsoDate,
  toIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import { SequenceKeys } from '../../../common/numbering/document-numbering.service.js';
import {
  buildPage,
  toSkipTake,
  type Page,
} from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { CertificateSnapshot } from '../application/certificate-document.js';
import type {
  CertificateFilter,
  CertificateRecord,
  CertificateTypeChanges,
  CertificateTypeRecord,
  PageParams,
} from '../application/certificate.models.js';
import type {
  CertificateRepository,
  NewCertificate,
} from '../application/ports/certificate.repository.js';
import { personNameFilters } from './person-name.js';

const CERTIFICATE_SELECT = {
  id: true,
  congregationId: true,
  certificateTypeId: true,
  memberId: true,
  sequenceNumber: true,
  issuedOn: true,
  expiresOn: true,
  snapshot: true,
  voidedAt: true,
  voidReason: true,
  congregation: { select: { name: true } },
  certificateType: { select: { code: true, name: true } },
  issuedBy: { select: { displayName: true } },
} satisfies Prisma.CertificateSelect;

type CertificateRow = Prisma.CertificateGetPayload<{
  select: typeof CERTIFICATE_SELECT;
}>;

// CERT-MEM-2026-0031, typed by someone looking for a document.
const CERTIFICATE_NUMBER = /^CERT-([A-Z0-9_]{1,30})-(\d{4})-(\d{1,9})$/i;

@Injectable()
export class PrismaCertificateRepository
  extends TenantScopedRepository
  implements CertificateRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listTypes(scope: TenantScope): Promise<CertificateTypeRecord[]> {
    const rows = await this.prisma.certificateType.findMany({
      where: { denominationId: scope.denominationId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toTypeRecord);
  }

  async findType(
    scope: TenantScope,
    typeId: number,
  ): Promise<CertificateTypeRecord | null> {
    const row = await this.prisma.certificateType.findFirst({
      where: { id: typeId, denominationId: scope.denominationId },
    });
    return row ? toTypeRecord(row) : null;
  }

  async updateType(
    scope: TenantScope,
    typeId: number,
    changes: CertificateTypeChanges,
    transaction: Transaction,
  ): Promise<CertificateTypeRecord | null> {
    const client = clientOf(this.prisma, transaction);
    const where = { id: typeId, denominationId: scope.denominationId };
    const result = await client.certificateType.updateMany({
      where,
      data: changes,
    });
    if (result.count !== 1) {
      return null;
    }
    const row = await client.certificateType.findFirst({ where });
    return row ? toTypeRecord(row) : null;
  }

  async lastSequenceValues(
    scope: TenantScope,
    typeCodes: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const keys = typeCodes.map((code) => SequenceKeys.certificate(code));
    const rows = await this.prisma.documentSequence.findMany({
      where: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        key: { in: keys },
      },
      select: { key: true, lastValue: true },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.lastValue]));
    return new Map(
      typeCodes.map((code) => [
        code,
        byKey.get(SequenceKeys.certificate(code)) ?? 0,
      ]),
    );
  }

  async insert(
    scope: TenantScope,
    data: NewCertificate,
    transaction: Transaction,
  ): Promise<CertificateRecord> {
    const row = await clientOf(this.prisma, transaction).certificate.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        certificateTypeId: data.certificateTypeId,
        memberId: data.memberId,
        sequenceNumber: data.sequenceNumber,
        issuedOn: parseIsoDate(data.issuedOn),
        expiresOn: data.expiresOn ? parseIsoDate(data.expiresOn) : null,
        notes: data.notes,
        pastorSignerId: data.pastorSignerId,
        secretarySignerId: data.secretarySignerId,
        issuedById: data.issuedById,
        snapshot: data.snapshot as unknown as Prisma.InputJsonValue,
      },
      select: CERTIFICATE_SELECT,
    });
    return toRecord(row);
  }

  async findById(
    scope: TenantScope,
    id: number,
  ): Promise<CertificateRecord | null> {
    const row = await this.prisma.certificate.findFirst({
      where: this.scoped(scope, { id }),
      select: CERTIFICATE_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async list(
    scope: TenantScope,
    filter: CertificateFilter,
    paging: PageParams,
  ): Promise<Page<CertificateRecord>> {
    const where = this.buildWhere(scope, filter);
    const [total, rows] = await Promise.all([
      this.prisma.certificate.count({ where }),
      this.prisma.certificate.findMany({
        where,
        orderBy: orderBy(filter),
        ...toSkipTake(paging),
        select: CERTIFICATE_SELECT,
      }),
    ]);
    return buildPage(rows.map(toRecord), total, paging);
  }

  async listForExport(
    scope: TenantScope,
    filter: CertificateFilter,
    limit: number,
  ): Promise<CertificateRecord[]> {
    const rows = await this.prisma.certificate.findMany({
      where: this.buildWhere(scope, filter),
      orderBy: orderBy(filter),
      take: limit,
      select: CERTIFICATE_SELECT,
    });
    return rows.map(toRecord);
  }

  async markVoided(
    scope: TenantScope,
    id: number,
    reason: string,
    at: Date,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).certificate.updateMany({
      where: this.scoped(scope, { id, voidedAt: null }),
      data: { voidedAt: at, voidReason: reason },
    });
    return result.count === 1;
  }

  async countIssued(
    scope: TenantScope,
    range: { from: string; to: string },
    typeCode?: string,
  ): Promise<{ issued: number; voided: number }> {
    const where = this.scoped(scope, {
      issuedOn: { gte: parseIsoDate(range.from), lte: parseIsoDate(range.to) },
      ...(typeCode ? { certificateType: { code: typeCode } } : {}),
    });
    const [issued, voided] = await Promise.all([
      this.prisma.certificate.count({ where }),
      this.prisma.certificate.count({
        where: { ...where, voidedAt: { not: null } },
      }),
    ]);
    return { issued, voided };
  }

  private buildWhere(
    scope: TenantScope,
    filter: CertificateFilter,
  ): Prisma.CertificateWhereInput {
    const conditions: Prisma.CertificateWhereInput[] = [];
    if (filter.typeCode) {
      conditions.push({ certificateType: { code: filter.typeCode } });
    }
    if (filter.status === 'ISSUED') {
      conditions.push({ voidedAt: null });
    } else if (filter.status === 'VOIDED') {
      conditions.push({ voidedAt: { not: null } });
    }
    if (filter.memberId !== undefined) {
      conditions.push({ memberId: filter.memberId });
    }
    if (filter.issuedFrom) {
      conditions.push({ issuedOn: { gte: parseIsoDate(filter.issuedFrom) } });
    }
    if (filter.issuedTo) {
      conditions.push({ issuedOn: { lte: parseIsoDate(filter.issuedTo) } });
    }
    const query = filter.q?.trim();
    if (query) {
      conditions.push(searchCondition(query));
    }
    return this.scoped(scope, { AND: conditions });
  }
}

function searchCondition(query: string): Prisma.CertificateWhereInput {
  const number = CERTIFICATE_NUMBER.exec(query);
  if (number) {
    const year = Number(number[2]);
    return {
      certificateType: { code: number[1].toUpperCase() },
      sequenceNumber: Number(number[3]),
      issuedOn: {
        gte: parseIsoDate(`${year}-01-01`),
        lte: parseIsoDate(`${year}-12-31`),
      },
    };
  }
  return { member: { person: { AND: personNameFilters(query) } } };
}

function orderBy(
  filter: CertificateFilter,
): Prisma.CertificateOrderByWithRelationInput[] {
  const direction = filter.sort === 'issuedOn:asc' ? 'asc' : 'desc';
  return [{ issuedOn: direction }, { id: direction }];
}

function toTypeRecord(row: {
  id: number;
  code: string;
  name: string;
  template: string | null;
  introTemplate: string | null;
  closingTemplate: string | null;
  pastorTitleTemplate: string | null;
  secretaryTitleTemplate: string | null;
  validityDays: number | null;
}): CertificateTypeRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    template: row.template,
    introTemplate: row.introTemplate,
    closingTemplate: row.closingTemplate,
    pastorTitleTemplate: row.pastorTitleTemplate,
    secretaryTitleTemplate: row.secretaryTitleTemplate,
    validityDays: row.validityDays,
  };
}

function toRecord(row: CertificateRow): CertificateRecord {
  return {
    id: row.id,
    congregationId: row.congregationId,
    congregationName: row.congregation.name,
    typeId: row.certificateTypeId,
    typeCode: row.certificateType.code,
    typeName: row.certificateType.name,
    memberId: row.memberId,
    sequenceNumber: row.sequenceNumber,
    issuedOn: toIsoDate(row.issuedOn),
    expiresOn: toIsoDateOrNull(row.expiresOn),
    issuedByName: row.issuedBy?.displayName ?? null,
    snapshot: row.snapshot as unknown as CertificateSnapshot,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
  };
}
