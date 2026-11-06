import { Inject, Injectable, Optional } from '@nestjs/common';
import { DEFAULT_COUNTRY_ISO } from '../../../common/geo/default-country.js';
import {
  parseIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  MemberDetail,
  MemberListCriteria,
  MemberListPaging,
  MemberListResult,
  MemberListRow,
  MemberReference,
  MembershipDataPatch,
  MemberStatus,
  NewMemberRecord,
  StatusCounts,
} from '../application/member.models.js';
import type { MemberRepository } from '../application/ports/member.repository.js';
import { parseMemberCode, searchTerms } from '../application/person-text.js';
import {
  DetailPayload,
  ListRowPayload,
  detailArgs,
  listRowArgs,
  memberCodeOf,
  personNames,
} from './member-queries.js';

const optionalDate = (
  value: string | null | undefined,
): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : parseIsoDate(value);

@Injectable()
export class PrismaMemberRepository
  extends TenantScopedRepository
  implements MemberRepository
{
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(DEFAULT_COUNTRY_ISO)
    private readonly defaultCountryIso: string = 'CO',
  ) {
    super();
  }

  async list(
    scope: TenantScope,
    criteria: MemberListCriteria,
    paging: MemberListPaging,
  ): Promise<MemberListResult> {
    const withoutStatus = this.where(scope, { ...criteria, status: 'ALL' });
    const where = this.where(scope, criteria);
    const [rows, total, grouped] = await Promise.all([
      this.prisma.member.findMany({
        where,
        ...listRowArgs,
        orderBy: this.orderBy(paging),
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
      }),
      this.prisma.member.count({ where }),
      this.prisma.member.groupBy({
        by: ['status'],
        where: withoutStatus,
        _count: { _all: true },
      }),
    ]);
    return {
      rows: rows.map((row) => this.toRow(row)),
      total,
      statusCounts: this.toCounts(grouped),
    };
  }

  async listForExport(
    scope: TenantScope,
    criteria: MemberListCriteria,
    limit: number,
  ): Promise<MemberListRow[]> {
    const rows = await this.prisma.member.findMany({
      where: this.where(scope, criteria),
      ...listRowArgs,
      orderBy: this.orderBy({ sortBy: 'name', order: 'asc' }),
      take: limit,
    });
    return rows.map((row) => this.toRow(row));
  }

  async findDetail(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<MemberDetail | null> {
    const row = await clientOf(this.prisma, transaction).member.findFirst({
      where: this.scoped(scope, { id: memberId, deletedAt: null }),
      ...detailArgs,
    });
    return row ? this.toDetail(row) : null;
  }

  async findReference(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<MemberReference | null> {
    const row = await clientOf(this.prisma, transaction).member.findFirst({
      where: this.scoped(scope, { id: memberId, deletedAt: null }),
      select: {
        id: true,
        personId: true,
        congregationId: true,
        status: true,
        pastoralRankId: true,
      },
    });
    return row;
  }

  async insert(
    scope: TenantScope,
    record: NewMemberRecord,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const refs = await this.resolveMemberRefs(client, scope, record);
    const created = await client.member.create({
      data: {
        denominationId: scope.denominationId,
        personId: record.personId,
        congregationId: record.congregationId,
        status: 'ACTIVE',
        joinedOn: parseIsoDate(record.joinedOn),
        convertedOn: optionalDate(record.convertedOn),
        isBaptized: record.isBaptized,
        waterBaptismOn: optionalDate(record.waterBaptismOn),
        baptismMunicipalityId: refs.baptismMunicipalityId,
        baptismPlace: record.baptismPlace,
        baptizingPastorId: refs.baptizingPastorId,
        holySpiritBaptismOn: optionalDate(record.holySpiritBaptismOn),
        reconciledOn: optionalDate(record.reconciledOn),
        previousCongregationId: refs.previousCongregationId,
        previousCongregationName: record.previousCongregationName,
        isChristianEducationTeacher:
          record.isChristianEducationTeacher ?? false,
        desiredAreas: record.desiredAreas ?? null,
        pastorNotes: record.pastorNotes ?? null,
      },
      select: { id: true },
    });
    return created.id;
  }

  async updateMembershipData(
    scope: TenantScope,
    memberId: number,
    patch: MembershipDataPatch,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const refs = await this.resolveMemberRefs(client, scope, patch);
    await client.member.updateMany({
      where: this.scoped(scope, { id: memberId }),
      data: {
        joinedOn: optionalDate(patch.joinedOn),
        convertedOn: optionalDate(patch.convertedOn),
        isBaptized: patch.isBaptized,
        waterBaptismOn: optionalDate(patch.waterBaptismOn),
        ...(patch.baptismMunicipalityCode !== undefined
          ? { baptismMunicipalityId: refs.baptismMunicipalityId ?? null }
          : {}),
        baptismPlace: patch.baptismPlace,
        ...(patch.baptizingPastorName !== undefined
          ? { baptizingPastorId: refs.baptizingPastorId ?? null }
          : {}),
        holySpiritBaptismOn: optionalDate(patch.holySpiritBaptismOn),
        reconciledOn: optionalDate(patch.reconciledOn),
        ...(patch.previousCongregationId !== undefined
          ? { previousCongregationId: refs.previousCongregationId ?? null }
          : {}),
        previousCongregationName: patch.previousCongregationName,
        ...(patch.isChristianEducationTeacher !== undefined
          ? { isChristianEducationTeacher: patch.isChristianEducationTeacher }
          : {}),
        ...(patch.desiredAreas !== undefined
          ? { desiredAreas: patch.desiredAreas }
          : {}),
        ...(patch.pastorNotes !== undefined
          ? { pastorNotes: patch.pastorNotes }
          : {}),
      },
    });
  }

  private async resolveMemberRefs(
    client: Prisma.TransactionClient,
    scope: TenantScope,
    patch: {
      baptismMunicipalityCode?: string | null;
      baptizingPastorName?: string | null;
      previousCongregationId?: number | null;
    },
  ): Promise<{
    baptismMunicipalityId: number | undefined;
    baptizingPastorId: number | undefined;
    previousCongregationId: number | undefined;
  }> {
    const baptismMunicipality = patch.baptismMunicipalityCode
      ? await client.municipality.findFirst({
          where: {
            code: patch.baptismMunicipalityCode,
            region: { country: { isoAlpha2: this.defaultCountryIso } },
          },
          select: { id: true },
        })
      : undefined;

    let baptizingPastorId: number | undefined;
    if (patch.baptizingPastorName) {
      const clean = patch.baptizingPastorName.trim().slice(0, 200);
      const existing = await client.person.findFirst({
        where: {
          denominationId: scope.denominationId,
          deletedAt: null,
          fullName: clean,
        },
        select: { id: true },
      });
      if (existing) {
        baptizingPastorId = existing.id;
      } else {
        const created = await client.person.create({
          data: { denominationId: scope.denominationId, fullName: clean },
          select: { id: true },
        });
        baptizingPastorId = created.id;
      }
    }

    const previousCongregation = patch.previousCongregationId
      ? await client.congregation.findFirst({
          where: {
            id: patch.previousCongregationId,
            denominationId: scope.denominationId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : undefined;

    return {
      baptismMunicipalityId: baptismMunicipality?.id,
      baptizingPastorId,
      previousCongregationId: previousCongregation?.id,
    };
  }

  async updateStatus(
    scope: TenantScope,
    memberId: number,
    status: MemberStatus,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).member.updateMany({
      where: this.scoped(scope, { id: memberId }),
      data: { status },
    });
  }

  async updateCongregation(
    scope: TenantScope,
    memberId: number,
    congregationId: number,
    transaction: Transaction,
  ): Promise<void> {
    // The where clause keeps the tenant of the caller; the new congregation is the destination.
    await clientOf(this.prisma, transaction).member.updateMany({
      where: this.scoped(scope, { id: memberId }),
      data: { congregationId },
    });
  }

  async updatePastoralRank(
    scope: TenantScope,
    memberId: number,
    pastoralRankId: number | null,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).member.updateMany({
      where: this.scoped(scope, { id: memberId }),
      data: { pastoralRankId },
    });
  }

  async clearNotes(
    scope: TenantScope,
    memberId: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).member.updateMany({
      where: this.scoped(scope, { id: memberId }),
      data: { pastorNotes: null, desiredAreas: null },
    });
  }

  // ---------- Filters ----------

  private where(
    scope: TenantScope,
    criteria: MemberListCriteria,
  ): Prisma.MemberWhereInput {
    const base = this.scoped(scope, { deletedAt: null });
    const and: Prisma.MemberWhereInput[] = [];

    if (scope.congregationId === null && criteria.congregationId !== null) {
      and.push({ congregationId: criteria.congregationId });
    }
    if (criteria.status !== 'ALL') {
      and.push({ status: criteria.status });
    }
    const person = this.personFilter(criteria);
    if (person) {
      and.push({ person });
    }
    if (criteria.position === 'NONE') {
      and.push({ memberPositions: { none: { endedOn: null } } });
    } else if (typeof criteria.position === 'number') {
      and.push({
        memberPositions: {
          some: { positionId: criteria.position, endedOn: null },
        },
      });
    }
    for (const term of searchTerms(criteria.text)) {
      and.push(this.termFilter(term));
    }
    return { ...base, AND: and };
  }

  private personFilter(
    criteria: MemberListCriteria,
  ): Prisma.PersonWhereInput | null {
    const filter: Prisma.PersonWhereInput = { deletedAt: null };
    let changed = false;
    if (criteria.sex !== 'ALL') {
      filter.sex = criteria.sex;
      changed = true;
    }
    if (criteria.bornOnOrAfter !== null || criteria.bornOnOrBefore !== null) {
      filter.birthDate = {
        ...(criteria.bornOnOrAfter
          ? { gte: parseIsoDate(criteria.bornOnOrAfter) }
          : {}),
        ...(criteria.bornOnOrBefore
          ? { lte: parseIsoDate(criteria.bornOnOrBefore) }
          : {}),
      };
      changed = true;
    }
    return changed ? filter : null;
  }

  /**
   * A word matches names, document or the member code (SC-0130). The collation of the tables is
   * accent- and case-insensitive, so `contains` already behaves like the UI search.
   */
  private termFilter(term: string): Prisma.MemberWhereInput {
    const code = parseMemberCode(term);
    const normalizedDocument = term.replace(/[.\s-]/g, '');
    return {
      OR: [
        {
          person: {
            OR: [
              { firstName: { contains: term } },
              { lastName: { contains: term } },
              { secondLastName: { contains: term } },
              { fullName: { contains: term } },
              ...(normalizedDocument
                ? [{ documentNumber: { contains: normalizedDocument } }]
                : []),
            ],
          },
        },
        ...(code
          ? [
              {
                memberRegistryEntries: {
                  some: {
                    memberNumber: code.number,
                    congregation: { code: code.code },
                  },
                },
              },
            ]
          : []),
      ],
    };
  }

  private orderBy(
    paging: Pick<MemberListPaging, 'sortBy' | 'order'>,
  ): Prisma.MemberOrderByWithRelationInput[] {
    const direction = paging.order;
    switch (paging.sortBy) {
      case 'joinedOn':
        return [{ joinedOn: direction }, { id: 'asc' }];
      case 'age':
        // The oldest birth date is the greatest age.
        return [
          { person: { birthDate: direction === 'asc' ? 'desc' : 'asc' } },
          { id: 'asc' },
        ];
      case 'name':
        return [
          { person: { lastName: direction } },
          { person: { firstName: direction } },
          { id: 'asc' },
        ];
    }
  }

  // ---------- Mapping ----------

  private toCounts(
    grouped: readonly { status: MemberStatus; _count: { _all: number } }[],
  ): StatusCounts {
    const counts: Record<'ALL' | MemberStatus, number> = {
      ALL: 0,
      ACTIVE: 0,
      INACTIVE: 0,
      TRANSFERRED: 0,
      DECEASED: 0,
    };
    for (const group of grouped) {
      counts[group.status] = group._count._all;
      counts.ALL += group._count._all;
    }
    return counts;
  }

  private toRow(row: ListRowPayload): MemberListRow {
    return {
      id: row.id,
      code: memberCodeOf(row.memberRegistryEntries),
      fullName: personNames(row.person),
      sex: row.person.sex,
      documentTypeCode: row.person.documentType?.code ?? null,
      documentNumber: row.person.documentNumber,
      birthDate: toIsoDateOrNull(row.person.birthDate),
      phone: row.person.personContacts[0]?.value ?? null,
      joinedOn: toIsoDateOrNull(row.joinedOn),
      status: row.status,
      congregationId: row.congregationId,
      congregationName: row.congregation.name,
      positions: row.memberPositions.map((position) => position.position.name),
    };
  }

  private toDetail(row: DetailPayload): MemberDetail {
    const { person } = row;
    const mobile = person.personContacts.find(
      (contact) => contact.type === 'MOBILE',
    );
    const landline = person.personContacts.find(
      (contact) => contact.type === 'LANDLINE',
    );
    const workPhone = person.personContacts.find(
      (contact) => contact.type === 'WORK_PHONE',
    );
    const email = person.personContacts.find(
      (contact) => contact.type === 'EMAIL',
    );
    const address = person.personAddresses[0];
    const marriageAsSpouse1 = person.marriagesAsSpouse1?.[0];
    const marriageAsSpouse2 = person.marriagesAsSpouse2?.[0];
    const activeMarriage = marriageAsSpouse1 ?? marriageAsSpouse2 ?? null;
    const spousePerson = marriageAsSpouse1
      ? marriageAsSpouse1.spouse2
      : marriageAsSpouse2
        ? marriageAsSpouse2.spouse1
        : null;
    const spouseFullName = spousePerson ? personNames(spousePerson) : null;
    return {
      id: row.id,
      code: memberCodeOf(row.memberRegistryEntries),
      status: row.status,
      joinedOn: toIsoDateOrNull(row.joinedOn),
      convertedOn: toIsoDateOrNull(row.convertedOn),
      isBaptized: row.isBaptized,
      waterBaptismOn: toIsoDateOrNull(row.waterBaptismOn),
      baptismMunicipalityCode: row.baptismMunicipality?.code ?? null,
      baptismPlace: row.baptismPlace,
      baptizingPastorName: row.baptizingPastor
        ? personNames(row.baptizingPastor)
        : null,
      holySpiritBaptismOn: toIsoDateOrNull(row.holySpiritBaptismOn),
      reconciledOn: toIsoDateOrNull(row.reconciledOn),
      previousCongregationId: row.previousCongregationId,
      previousCongregationName: row.previousCongregationName,
      isChristianEducationTeacher: row.isChristianEducationTeacher,
      desiredAreas: row.desiredAreas,
      pastorNotes: row.pastorNotes,
      congregationId: row.congregationId,
      congregationName: row.congregation.name,
      congregationMunicipalityCode: row.congregation.municipality?.code ?? null,
      person: {
        id: person.id,
        denominationId: person.denominationId,
        userId: person.userId,
        documentTypeCode: person.documentType?.code ?? null,
        documentNumber: person.documentNumber,
        documentIssuePlaceCode: person.documentIssuePlace?.code ?? null,
        firstName: person.firstName ?? person.fullName ?? '',
        lastName: person.lastName ?? '',
        secondLastName: person.secondLastName,
        sex: person.sex,
        birthDate: toIsoDateOrNull(person.birthDate),
        birthPlaceCode: person.birthPlace?.code ?? null,
        maritalStatusCode: person.maritalStatus?.code ?? null,
        educationLevelCode: person.educationLevel?.code ?? null,
        profession: person.profession,
        occupation: person.occupation,
        workplace: person.workplace,
        childrenCount: person.childrenCount,
        phone: (mobile ?? landline)?.value ?? null,
        landlinePhone: landline?.value ?? null,
        workPhone: workPhone?.value ?? null,
        email: email?.value ?? null,
        address: address?.address ? address.address : null,
        municipalityCode: address?.municipality?.code ?? null,
        neighborhood: address?.neighborhood?.name ?? null,
        spouseFullName,
        marriageIsCivil: activeMarriage?.isCivil ?? false,
        marriageIsChristian: activeMarriage?.isChristian ?? false,
        marriageIsCatholic: activeMarriage?.isCatholic ?? false,
        tribunalOpinion: activeMarriage?.tribunalOpinion ?? null,
      },
    };
  }
}
