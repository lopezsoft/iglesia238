import { Injectable } from '@nestjs/common';
import {
  parseIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  PersonSearchCriteria,
  PersonSearchRow,
} from '../application/member.models.js';
import type { PeopleSearchRepository } from '../application/ports/member-details.repositories.js';
import { parseMemberCode, searchTerms } from '../application/person-text.js';
import {
  LATEST_REGISTRY_ENTRY,
  memberCodeOf,
  personNames,
} from './member-queries.js';

const rowArgs = {
  include: {
    documentType: { select: { code: true } },
    member: {
      include: {
        congregation: { select: { name: true } },
        memberRegistryEntries: LATEST_REGISTRY_ENTRY,
      },
    },
  },
} satisfies Prisma.PersonDefaultArgs;

type SearchPayload = Prisma.PersonGetPayload<typeof rowArgs>;

/** Fetches more rows than needed when the preferred congregation is sorted first afterwards. */
const PREFERRED_OVERFETCH = 4;

/**
 * Single implementation behind every people lookup. Visibility depends on the purpose (see
 * PersonSearchPurpose); the denomination always limits the query, and the congregation limits it
 * wherever the purpose is about the members of one congregation.
 */
@Injectable()
export class PrismaPeopleSearchRepository implements PeopleSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    scope: TenantScope,
    criteria: PersonSearchCriteria,
  ): Promise<PersonSearchRow[]> {
    const purposeFilter = this.purposeFilter(scope, criteria);
    if (purposeFilter === null) {
      return [];
    }
    const preferred = criteria.preferredCongregationId;
    const rows = await this.prisma.person.findMany({
      where: {
        denominationId: scope.denominationId,
        deletedAt: null,
        ...(criteria.excludePersonId === null
          ? {}
          : { id: { not: criteria.excludePersonId } }),
        AND: [
          purposeFilter,
          ...this.birthFilter(criteria),
          ...searchTerms(criteria.query).map((term) => this.termFilter(term)),
        ],
      },
      ...rowArgs,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      take:
        preferred === null
          ? criteria.limit
          : criteria.limit * PREFERRED_OVERFETCH,
    });

    const marriedIds = criteria.withMarriage
      ? await this.marriedAmong(
          scope,
          rows.map((row) => row.id),
        )
      : new Set<number>();
    const mapped = rows.map((row) => this.toRow(row, marriedIds.has(row.id)));
    if (preferred === null) {
      return mapped;
    }
    // Array.prototype.sort is stable, so the name order is kept inside each group.
    return mapped
      .sort(
        (a, b) =>
          Number(b.congregationId === preferred) -
          Number(a.congregationId === preferred),
      )
      .slice(0, criteria.limit);
  }

  private purposeFilter(
    scope: TenantScope,
    criteria: PersonSearchCriteria,
  ): Prisma.PersonWhereInput | null {
    const { congregationId } = scope;
    switch (criteria.purpose) {
      case 'MEMBER_LOOKUP':
        return congregationId === null
          ? null
          : {
              member: {
                is: { status: 'ACTIVE', deletedAt: null, congregationId },
              },
            };
      case 'FAMILY_CANDIDATE':
        return {};
      case 'UNLINKED_PERSON':
        return { member: { is: null } };
      case 'CONTRIBUTOR':
        return {
          member: { is: { status: { not: 'DECEASED' }, deletedAt: null } },
        };
      case 'SECRETARIAT':
        // Persons carry no congregation: a sede sees its own members and the people who are not
        // members of any sede (relatives, guardians), but not the members of other sedes.
        return congregationId === null
          ? {}
          : {
              OR: [
                { member: { is: null } },
                { member: { is: { congregationId, deletedAt: null } } },
              ],
            };
    }
  }

  private birthFilter(
    criteria: PersonSearchCriteria,
  ): Prisma.PersonWhereInput[] {
    if (criteria.bornOnOrAfter === null && criteria.bornOnOrBefore === null) {
      return [];
    }
    const window: Prisma.PersonWhereInput = {
      birthDate: {
        ...(criteria.bornOnOrAfter
          ? { gte: parseIsoDate(criteria.bornOnOrAfter) }
          : {}),
        ...(criteria.bornOnOrBefore
          ? { lte: parseIsoDate(criteria.bornOnOrBefore) }
          : {}),
      },
    };
    return [
      criteria.includeUnknownBirthDate
        ? { OR: [{ birthDate: null }, window] }
        : window,
    ];
  }

  /** A word matches the names, the document or the member code (SC-0130). */
  private termFilter(term: string): Prisma.PersonWhereInput {
    const code = parseMemberCode(term);
    const document = term.replace(/[.\s-]/g, '');
    return {
      OR: [
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { secondLastName: { contains: term } },
        { fullName: { contains: term } },
        ...(document ? [{ documentNumber: { contains: document } }] : []),
        ...(code
          ? [
              {
                member: {
                  is: {
                    memberRegistryEntries: {
                      some: {
                        memberNumber: code.number,
                        congregation: { code: code.code },
                      },
                    },
                  },
                },
              },
            ]
          : []),
      ],
    };
  }

  private async marriedAmong(
    scope: TenantScope,
    personIds: readonly number[],
  ): Promise<Set<number>> {
    if (personIds.length === 0) {
      return new Set();
    }
    const marriages = await this.prisma.marriage.findMany({
      where: {
        denominationId: scope.denominationId,
        endedOn: null,
        OR: [
          { spouse1Id: { in: [...personIds] } },
          { spouse2Id: { in: [...personIds] } },
        ],
      },
      select: { spouse1Id: true, spouse2Id: true },
    });
    return new Set(
      marriages.flatMap((marriage) => [marriage.spouse1Id, marriage.spouse2Id]),
    );
  }

  private toRow(
    row: SearchPayload,
    hasActiveMarriage: boolean,
  ): PersonSearchRow {
    const member =
      row.member && row.member.deletedAt === null ? row.member : null;
    return {
      personId: row.id,
      fullName: personNames(row),
      documentTypeCode: row.documentType?.code ?? null,
      documentNumber: row.documentNumber,
      sex: row.sex,
      birthDate: toIsoDateOrNull(row.birthDate),
      memberId: member?.id ?? null,
      memberCode: member ? memberCodeOf(member.memberRegistryEntries) : null,
      memberStatus: member?.status ?? null,
      congregationId: member?.congregationId ?? null,
      congregationName: member?.congregation.name ?? null,
      isBaptized: member?.isBaptized ?? null,
      waterBaptismOn: toIsoDateOrNull(member?.waterBaptismOn ?? null),
      joinedOn: toIsoDateOrNull(member?.joinedOn ?? null),
      hasActiveMarriage,
    };
  }
}
