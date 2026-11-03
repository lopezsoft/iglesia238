import { Injectable } from '@nestjs/common';
import { toIsoDateOrNull } from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { parseFormData } from '../domain/application-form-data.js';
import {
  APPLICATION_STATUSES,
  countByFilter,
  FILTER_STATUSES,
  type ApplicationStatus,
} from '../domain/application-status.js';
import type {
  ApplicationChange,
  ApplicationListQuery,
  ApplicationListResult,
  ApplicationRecord,
  ApplicationsRepository,
} from '../application/ports/applications.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEARCH_WORDS = 4;

/** Midnight in Bogota (UTC-5, no daylight saving time) of a YYYY-MM-DD day. */
function bogotaDayStart(day: string): Date {
  return new Date(`${day}T00:00:00-05:00`);
}

/** LIKE wildcards typed by the user must not widen the search. */
function searchWords(search: string | null): string[] {
  return (search ?? '')
    .replace(/[%_\\]/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, MAX_SEARCH_WORDS);
}

const detailSelect = {
  id: true,
  denominationId: true,
  congregationId: true,
  policyId: true,
  status: true,
  documentNumber: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  birthDate: true,
  guardianName: true,
  guardianDocument: true,
  formData: true,
  consentedAt: true,
  createdAt: true,
  reviewerId: true,
  reviewedAt: true,
  rejectionReason: true,
  matchedPersonId: true,
  memberId: true,
  documentType: { select: { code: true, name: true } },
  congregation: { select: { name: true, code: true } },
  policy: { select: { version: true } },
  reviewer: { select: { displayName: true, email: true } },
} satisfies Prisma.MembershipApplicationSelect;

@Injectable()
export class PrismaApplicationsRepository
  extends TenantScopedRepository
  implements ApplicationsRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(
    scope: TenantScope,
    query: ApplicationListQuery,
  ): Promise<ApplicationListResult> {
    const base: Prisma.MembershipApplicationWhereInput = this.scoped(
      scope,
      query.congregationId !== null
        ? { congregationId: query.congregationId }
        : {},
    );

    const where: Prisma.MembershipApplicationWhereInput = {
      ...base,
      status: { in: [...FILTER_STATUSES[query.filter]] },
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: bogotaDayStart(query.from) } : {}),
              ...(query.to
                ? { lt: new Date(bogotaDayStart(query.to).getTime() + DAY_MS) }
                : {}),
            },
          }
        : {}),
      AND: searchWords(query.search).map((word) => ({
        OR: [
          { firstName: { contains: word } },
          { lastName: { contains: word } },
          { documentNumber: { contains: word } },
        ],
      })),
    };

    const [rows, total, grouped] = await Promise.all([
      this.prisma.membershipApplication.findMany({
        where,
        orderBy: [{ createdAt: query.order }, { id: query.order }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          congregationId: true,
          status: true,
          firstName: true,
          lastName: true,
          documentNumber: true,
          birthDate: true,
          guardianName: true,
          formData: true,
          createdAt: true,
          documentType: { select: { code: true } },
          congregation: { select: { name: true } },
        },
      }),
      this.prisma.membershipApplication.count({ where }),
      this.prisma.membershipApplication.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
    ]);

    const byStatus: Partial<Record<ApplicationStatus, number>> = {};
    for (const group of grouped) {
      if (APPLICATION_STATUSES.includes(group.status)) {
        byStatus[group.status] = group._count._all;
      }
    }

    return {
      items: rows.map((row) => ({
        id: row.id,
        congregationId: row.congregationId,
        congregationName: row.congregation.name,
        status: row.status,
        firstName: row.firstName,
        lastName: row.lastName,
        secondLastName: parseFormData(row.formData).secondLastName,
        documentTypeCode: row.documentType?.code ?? null,
        documentNumber: row.documentNumber,
        birthDate: toIsoDateOrNull(row.birthDate),
        guardianName: row.guardianName,
        createdAt: row.createdAt,
      })),
      total,
      counts: countByFilter(byStatus),
    };
  }

  async findById(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<ApplicationRecord | null> {
    const client = clientOf(this.prisma, transaction);
    const row = await client.membershipApplication.findFirst({
      where: this.scoped(scope, { id }),
      select: detailSelect,
    });
    if (!row) {
      return null;
    }

    const formData = parseFormData(row.formData);
    const [municipality, maritalStatus, entry] = await Promise.all([
      formData.municipalityCode
        ? client.municipality.findFirst({
            where: { code: formData.municipalityCode },
            select: { name: true, region: { select: { name: true } } },
          })
        : null,
      formData.maritalStatusCode
        ? client.maritalStatus.findUnique({
            where: { code: formData.maritalStatusCode },
            select: { name: true },
          })
        : null,
      row.memberId !== null
        ? client.memberRegistryEntry.findFirst({
            where: {
              denominationId: row.denominationId,
              memberId: row.memberId,
              congregationId: row.congregationId,
            },
            orderBy: [{ startedOn: 'desc' }, { id: 'desc' }],
            select: { memberNumber: true },
          })
        : null,
    ]);

    return {
      id: row.id,
      denominationId: row.denominationId,
      congregationId: row.congregationId,
      congregationName: row.congregation.name,
      congregationCode: row.congregation.code,
      policyId: row.policyId,
      policyVersion: row.policy.version,
      status: row.status,
      documentTypeCode: row.documentType?.code ?? null,
      documentTypeName: row.documentType?.name ?? null,
      documentNumber: row.documentNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      birthDate: toIsoDateOrNull(row.birthDate),
      guardianName: row.guardianName,
      guardianDocument: row.guardianDocument,
      formData,
      maritalStatusName: maritalStatus?.name ?? null,
      municipalityName: municipality?.name ?? null,
      regionName: municipality?.region.name ?? null,
      consentedAt: row.consentedAt,
      createdAt: row.createdAt,
      reviewerId: row.reviewerId,
      reviewerName: row.reviewer
        ? (row.reviewer.displayName ?? row.reviewer.email)
        : null,
      reviewedAt: row.reviewedAt,
      rejectionReason: row.rejectionReason,
      matchedPersonId: row.matchedPersonId,
      memberId: row.memberId,
      memberNumber: entry?.memberNumber ?? null,
    };
  }

  async transition(
    scope: TenantScope,
    id: number,
    from: readonly ApplicationStatus[],
    change: ApplicationChange,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).membershipApplication.updateMany({
      where: this.scoped(scope, { id, status: { in: [...from] } }),
      data: {
        status: change.status,
        reviewerId: change.reviewerId,
        reviewedAt: change.reviewedAt,
        ...(change.rejectionReason !== undefined
          ? { rejectionReason: change.rejectionReason }
          : {}),
        ...(change.matchedPersonId !== undefined
          ? { matchedPersonId: change.matchedPersonId }
          : {}),
      },
    });
    return result.count === 1;
  }

  async attachMember(
    scope: TenantScope,
    id: number,
    memberId: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).membershipApplication.updateMany({
      where: this.scoped(scope, { id }),
      data: { memberId },
    });
  }
}
