import { Injectable } from '@nestjs/common';
import {
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import { formatMemberCode } from '../../../common/numbering/document-numbering.service.js';
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
import { addDays } from '../application/certificate-document.js';
import type {
  CardCandidateRecord,
  CardFilter,
  CardRecord,
  PageParams,
} from '../application/certificate.models.js';
import type {
  CardCounts,
  MembershipCardRepository,
  NewMembershipCard,
} from '../application/ports/membership-card.repository.js';
import {
  PERSON_NAME_SELECT,
  composePersonName,
  personNameFilters,
} from './person-name.js';

const CARD_SELECT = {
  id: true,
  memberId: true,
  congregationId: true,
  memberNumber: true,
  issuedOn: true,
  expiresOn: true,
  voidedAt: true,
  voidReason: true,
  member: { select: { person: { select: PERSON_NAME_SELECT } } },
  congregation: {
    select: {
      code: true,
      name: true,
      denomination: { select: { name: true } },
    },
  },
} satisfies Prisma.MembershipCardSelect;

type CardRow = Prisma.MembershipCardGetPayload<{ select: typeof CARD_SELECT }>;

const CANDIDATE_SELECT = {
  id: true,
  person: { select: PERSON_NAME_SELECT },
  congregation: { select: { code: true } },
  memberRegistryEntries: {
    where: { endedOn: null },
    take: 1,
    select: { memberNumber: true },
  },
} satisfies Prisma.MemberSelect;

// "SC-0130" or "SC0130": the prefix is letters, so a plain number is not taken for a member code.
const MEMBER_CODE = /^[A-Za-z]{1,10}-?(\d{1,9})$/;

@Injectable()
export class PrismaMembershipCardRepository
  extends TenantScopedRepository
  implements MembershipCardRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(
    scope: TenantScope,
    filter: CardFilter,
    paging: PageParams,
  ): Promise<Page<CardRecord>> {
    const where = this.scoped(scope, {
      AND: this.conditions(filter),
    });
    const [total, rows] = await Promise.all([
      this.prisma.membershipCard.count({ where }),
      this.prisma.membershipCard.findMany({
        where,
        orderBy: [{ issuedOn: 'desc' }, { id: 'desc' }],
        ...toSkipTake(paging),
        select: CARD_SELECT,
      }),
    ]);
    return buildPage(rows.map(toRecord), total, paging);
  }

  async findById(scope: TenantScope, id: number): Promise<CardRecord | null> {
    const row = await this.prisma.membershipCard.findFirst({
      where: this.scoped(scope, { id }),
      select: CARD_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async findByMember(
    scope: TenantScope,
    memberId: number,
  ): Promise<CardRecord[]> {
    const rows = await this.prisma.membershipCard.findMany({
      // The cards of every sede of the member: the congregation filter does not apply.
      where: { denominationId: scope.denominationId, memberId },
      select: CARD_SELECT,
    });
    return rows.map(toRecord);
  }

  async listCandidates(
    scope: TenantScope,
    query: { q?: string; today: string },
    paging: PageParams,
  ): Promise<Page<CardCandidateRecord>> {
    const congregationId = scope.requireCongregationId();
    const today = parseIsoDate(query.today);
    const text = query.q?.trim();
    const code = text ? MEMBER_CODE.exec(text) : null;
    const where = this.scoped(scope, {
      status: 'ACTIVE' as const,
      deletedAt: null,
      memberRegistryEntries: { some: { endedOn: null, congregationId } },
      membershipCards: {
        none: { congregationId, voidedAt: null, expiresOn: { gte: today } },
      },
      ...(text
        ? {
            OR: [
              { person: { AND: personNameFilters(text) } },
              ...(code
                ? [
                    {
                      memberRegistryEntries: {
                        some: { endedOn: null, memberNumber: Number(code[1]) },
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    });
    const [total, rows] = await Promise.all([
      this.prisma.member.count({ where }),
      this.prisma.member.findMany({
        where,
        orderBy: [
          { person: { lastName: 'asc' } },
          { person: { firstName: 'asc' } },
        ],
        ...toSkipTake(paging),
        select: {
          ...CANDIDATE_SELECT,
          membershipCards: {
            where: { congregationId, voidedAt: null, expiresOn: { lt: today } },
            take: 1,
            select: { id: true },
          },
        },
      }),
    ]);
    return buildPage(
      rows.map((row) => ({
        memberId: row.id,
        fullName: composePersonName(row.person),
        cardNumber: row.memberRegistryEntries[0]
          ? formatMemberCode(
              row.congregation.code,
              row.memberRegistryEntries[0].memberNumber,
            )
          : '',
        hasExpiredCard: row.membershipCards.length > 0,
      })),
      total,
      paging,
    );
  }

  async insert(
    scope: TenantScope,
    data: NewMembershipCard,
    transaction: Transaction,
  ): Promise<CardRecord> {
    const row = await clientOf(this.prisma, transaction).membershipCard.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        memberId: data.memberId,
        memberNumber: data.memberNumber,
        issuedOn: parseIsoDate(data.issuedOn),
        expiresOn: parseIsoDate(data.expiresOn),
      },
      select: CARD_SELECT,
    });
    return toRecord(row);
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
    ).membershipCard.updateMany({
      where: this.scoped(scope, { id, voidedAt: null }),
      data: { voidedAt: at, voidReason: reason },
    });
    return result.count === 1;
  }

  async counts(
    scope: TenantScope,
    today: string,
    expiringBefore: string,
  ): Promise<CardCounts> {
    const day = parseIsoDate(today);
    const soon = parseIsoDate(expiringBefore);
    const [valid, expiringSoon, expired] = await Promise.all([
      this.prisma.membershipCard.count({
        where: this.scoped(scope, { voidedAt: null, expiresOn: { gte: day } }),
      }),
      this.prisma.membershipCard.count({
        where: this.scoped(scope, {
          voidedAt: null,
          expiresOn: { gte: day, lte: soon },
        }),
      }),
      this.prisma.membershipCard.count({
        where: this.scoped(scope, { voidedAt: null, expiresOn: { lt: day } }),
      }),
    ]);
    return { valid, expiringSoon, expired };
  }

  private conditions(filter: CardFilter): Prisma.MembershipCardWhereInput[] {
    const today = parseIsoDate(filter.today);
    const conditions: Prisma.MembershipCardWhereInput[] = [];
    if (filter.status === 'VALID') {
      conditions.push({ voidedAt: null, expiresOn: { gte: today } });
    } else if (filter.status === 'EXPIRED') {
      conditions.push({ voidedAt: null, expiresOn: { lt: today } });
    } else if (filter.status === 'VOIDED') {
      conditions.push({ voidedAt: { not: null } });
    }
    if (filter.expiringInDays !== undefined) {
      conditions.push({
        voidedAt: null,
        expiresOn: {
          gte: today,
          lte: parseIsoDate(addDays(filter.today, filter.expiringInDays)),
        },
      });
    }
    const text = filter.q?.trim();
    if (text) {
      const code = MEMBER_CODE.exec(text);
      conditions.push({
        OR: [
          { member: { person: { AND: personNameFilters(text) } } },
          ...(code ? [{ memberNumber: Number(code[1]) }] : []),
        ],
      });
    }
    return conditions;
  }
}

function toRecord(row: CardRow): CardRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: composePersonName(row.member.person),
    congregationId: row.congregationId,
    congregationCode: row.congregation.code,
    congregationName: row.congregation.name,
    denominationName: row.congregation.denomination.name,
    memberNumber: row.memberNumber,
    issuedOn: toIsoDate(row.issuedOn),
    expiresOn: toIsoDate(row.expiresOn),
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
  };
}
