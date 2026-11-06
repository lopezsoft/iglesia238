import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_COUNTRY_ISO } from '../../../common/geo/default-country.js';
import { BusinessRuleException } from '../../../common/errors/domain.exception.js';
import { parseIsoDate } from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { composeFullName } from '../../../common/people/full-name.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  DocumentRef,
  ExistingPerson,
  MemberReactivation,
  MembershipRegistry,
  NewConsent,
  NewMember,
  NewRegistryEntry,
  PersonData,
  StatusRecord,
} from '../application/ports/membership-registry.port.js';

type Client = Prisma.TransactionClient;

const personSelect = {
  id: true,
  documentNumber: true,
  fullName: true,
  firstName: true,
  lastName: true,
  secondLastName: true,
  documentType: { select: { code: true } },
  member: {
    select: {
      id: true,
      status: true,
      deletedAt: true,
      congregationId: true,
      congregation: { select: { name: true, code: true } },
      memberRegistryEntries: {
        where: { endedOn: null },
        orderBy: [{ startedOn: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { memberNumber: true },
      },
    },
  },
} satisfies Prisma.PersonSelect;

type PersonRow = Prisma.PersonGetPayload<{ select: typeof personSelect }>;

function toExistingPerson(row: PersonRow): ExistingPerson {
  const member = row.member;
  return {
    id: row.id,
    fullName:
      composeFullName(row.firstName, row.lastName, row.secondLastName) ||
      row.fullName ||
      'Sin nombre',
    documentTypeCode: row.documentType?.code ?? null,
    documentNumber: row.documentNumber,
    member: member
      ? {
          id: member.id,
          // A soft-deleted member is a former member for every purpose of the approval.
          status: member.deletedAt ? 'INACTIVE' : member.status,
          congregationId: member.congregationId,
          congregationName: member.congregation.name,
          congregationCode: member.congregation.code,
          memberNumber: member.memberRegistryEntries[0]?.memberNumber ?? null,
        }
      : null,
  };
}

interface ResolvedCatalogs {
  documentTypeId: number;
  maritalStatusId: number | null;
  educationLevelId: number | null;
  municipalityId: number | null;
  documentIssuePlaceId: number | null;
  birthPlaceId: number | null;
}

/** Writes the membership tables on behalf of the approval of an application. */
@Injectable()
export class PrismaMembershipRegistry implements MembershipRegistry {
  constructor(
    private readonly prisma: PrismaService,
    /** The application form sends a bare municipality code: it is resolved inside this country. */
    @Inject(DEFAULT_COUNTRY_ISO) private readonly defaultCountryIso: string,
  ) {}

  async findPeopleByDocuments(
    scope: TenantScope,
    documents: readonly DocumentRef[],
    transaction?: Transaction,
  ): Promise<readonly ExistingPerson[]> {
    if (documents.length === 0) {
      return [];
    }
    const client = clientOf(this.prisma, transaction);
    const types = await client.documentType.findMany({
      where: {
        code: { in: [...new Set(documents.map((d) => d.documentTypeCode))] },
      },
      select: { id: true, code: true },
    });
    const typeIds = new Map(types.map((type) => [type.code, type.id]));

    const conditions = documents.flatMap((ref) => {
      const documentTypeId = typeIds.get(ref.documentTypeCode);
      return documentTypeId === undefined
        ? []
        : [{ documentTypeId, documentNumber: ref.documentNumber }];
    });
    if (conditions.length === 0) {
      return [];
    }

    const rows = await client.person.findMany({
      where: {
        denominationId: scope.denominationId,
        deletedAt: null,
        OR: conditions,
      },
      select: personSelect,
    });
    return rows.map(toExistingPerson);
  }

  async findPerson(
    scope: TenantScope,
    personId: number,
    transaction?: Transaction,
  ): Promise<ExistingPerson | null> {
    const row = await clientOf(this.prisma, transaction).person.findFirst({
      where: {
        id: personId,
        denominationId: scope.denominationId,
        deletedAt: null,
      },
      select: personSelect,
    });
    return row ? toExistingPerson(row) : null;
  }

  async createPerson(
    scope: TenantScope,
    data: PersonData,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const catalog = await this.resolveCatalogs(client, data);

    const person = await client.person.create({
      data: {
        denominationId: scope.denominationId,
        documentTypeId: catalog.documentTypeId,
        documentNumber: data.documentNumber,
        documentIssuePlaceId: catalog.documentIssuePlaceId,
        firstName: data.firstName,
        lastName: data.lastName,
        secondLastName: data.secondLastName,
        sex: data.sex,
        birthDate: data.birthDate ? parseIsoDate(data.birthDate) : null,
        birthPlaceId: catalog.birthPlaceId,
        maritalStatusId: catalog.maritalStatusId,
        educationLevelId: catalog.educationLevelId,
        profession: data.profession ?? null,
        occupation: data.occupation,
        workplace: data.workplace ?? null,
        childrenCount: data.childrenCount ?? null,
      },
      select: { id: true },
    });
    await this.addContactsAndAddress(client, scope, person.id, data, catalog, {
      phone: true,
      landlinePhone: true,
      email: true,
      workPhone: true,
      address: true,
    });
    await this.syncFamilyAndMarriage(client, scope, person.id, data);
    return person.id;
  }

  async completePerson(
    scope: TenantScope,
    personId: number,
    data: PersonData,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const current = await client.person.findFirst({
      where: { id: personId, denominationId: scope.denominationId },
      select: {
        firstName: true,
        lastName: true,
        secondLastName: true,
        sex: true,
        birthDate: true,
        documentIssuePlaceId: true,
        birthPlaceId: true,
        maritalStatusId: true,
        educationLevelId: true,
        profession: true,
        occupation: true,
        workplace: true,
        childrenCount: true,
        personContacts: { select: { type: true } },
        personAddresses: { where: { isCurrent: true }, select: { id: true } },
      },
    });
    if (!current) {
      return;
    }
    const catalog = await this.resolveCatalogs(client, data);

    const fill: Prisma.PersonUncheckedUpdateInput = {};
    if (!current.firstName) fill.firstName = data.firstName;
    if (!current.lastName) fill.lastName = data.lastName;
    if (!current.secondLastName && data.secondLastName) {
      fill.secondLastName = data.secondLastName;
    }
    if (!current.sex && data.sex) fill.sex = data.sex;
    if (!current.birthDate && data.birthDate) {
      fill.birthDate = parseIsoDate(data.birthDate);
    }
    if (
      current.documentIssuePlaceId === null &&
      catalog.documentIssuePlaceId !== null
    ) {
      fill.documentIssuePlaceId = catalog.documentIssuePlaceId;
    }
    if (current.birthPlaceId === null && catalog.birthPlaceId !== null) {
      fill.birthPlaceId = catalog.birthPlaceId;
    }
    if (current.maritalStatusId === null && catalog.maritalStatusId !== null) {
      fill.maritalStatusId = catalog.maritalStatusId;
    }
    if (
      current.educationLevelId === null &&
      catalog.educationLevelId !== null
    ) {
      fill.educationLevelId = catalog.educationLevelId;
    }
    if (!current.profession && data.profession) {
      fill.profession = data.profession;
    }
    if (!current.occupation && data.occupation) {
      fill.occupation = data.occupation;
    }
    if (!current.workplace && data.workplace) {
      fill.workplace = data.workplace;
    }
    if (
      current.childrenCount === null &&
      data.childrenCount !== null &&
      data.childrenCount !== undefined
    ) {
      fill.childrenCount = data.childrenCount;
    }
    if (Object.keys(fill).length > 0) {
      await client.person.update({ where: { id: personId }, data: fill });
    }

    await this.addContactsAndAddress(client, scope, personId, data, catalog, {
      phone: !current.personContacts.some((c) => c.type === 'MOBILE'),
      landlinePhone: !current.personContacts.some((c) => c.type === 'LANDLINE'),
      email: !current.personContacts.some((c) => c.type === 'EMAIL'),
      workPhone: !current.personContacts.some((c) => c.type === 'WORK_PHONE'),
      address: current.personAddresses.length === 0,
    });
    await this.syncFamilyAndMarriage(client, scope, personId, data);
  }

  async createMember(
    scope: TenantScope,
    member: NewMember,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const resolved = await this.resolveMemberRefs(client, scope, member);

    const created = await client.member.create({
      data: {
        denominationId: scope.denominationId,
        personId: member.personId,
        congregationId: member.congregationId,
        status: 'ACTIVE',
        joinedOn: parseIsoDate(member.joinedOn),
        convertedOn: member.convertedOn
          ? parseIsoDate(member.convertedOn)
          : null,
        isBaptized: member.isBaptized,
        waterBaptismOn: member.waterBaptismOn
          ? parseIsoDate(member.waterBaptismOn)
          : null,
        baptismMunicipalityId: resolved.baptismMunicipalityId,
        baptismPlace: member.baptismPlace ?? null,
        baptizingPastorId: resolved.baptizingPastorId,
        holySpiritBaptismOn: member.holySpiritBaptismOn
          ? parseIsoDate(member.holySpiritBaptismOn)
          : null,
        reconciledOn: member.reconciledOn
          ? parseIsoDate(member.reconciledOn)
          : null,
        previousCongregationId: resolved.previousCongregationId,
        previousCongregationName: member.previousCongregationName,
        isChristianEducationTeacher:
          member.isChristianEducationTeacher ?? false,
        desiredAreas: member.desiredAreas ?? null,
      },
      select: { id: true },
    });

    await this.syncMemberPositions(
      client,
      scope,
      created.id,
      member.pastPositionsText,
      member.currentPositionsText,
      member.joinedOn,
    );
    return created.id;
  }

  async reactivateMember(
    scope: TenantScope,
    reactivation: MemberReactivation,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const resolved = await this.resolveMemberRefs(client, scope, reactivation);

    await client.member.updateMany({
      where: {
        id: reactivation.memberId,
        denominationId: scope.denominationId,
      },
      data: {
        status: 'ACTIVE',
        deletedAt: null,
        congregationId: reactivation.congregationId,
        ...(reactivation.previousCongregationName
          ? { previousCongregationName: reactivation.previousCongregationName }
          : {}),
        ...(resolved.previousCongregationId !== null
          ? { previousCongregationId: resolved.previousCongregationId }
          : {}),
        ...(reactivation.convertedOn
          ? { convertedOn: parseIsoDate(reactivation.convertedOn) }
          : {}),
        ...(reactivation.isBaptized !== null &&
        reactivation.isBaptized !== undefined
          ? { isBaptized: reactivation.isBaptized }
          : {}),
        ...(reactivation.waterBaptismOn
          ? { waterBaptismOn: parseIsoDate(reactivation.waterBaptismOn) }
          : {}),
        ...(resolved.baptismMunicipalityId !== null
          ? { baptismMunicipalityId: resolved.baptismMunicipalityId }
          : {}),
        ...(reactivation.baptismPlace
          ? { baptismPlace: reactivation.baptismPlace }
          : {}),
        ...(resolved.baptizingPastorId !== null
          ? { baptizingPastorId: resolved.baptizingPastorId }
          : {}),
        ...(reactivation.holySpiritBaptismOn
          ? {
              holySpiritBaptismOn: parseIsoDate(
                reactivation.holySpiritBaptismOn,
              ),
            }
          : {}),
        ...(reactivation.reconciledOn
          ? { reconciledOn: parseIsoDate(reactivation.reconciledOn) }
          : {}),
        ...(reactivation.isChristianEducationTeacher !== undefined
          ? {
              isChristianEducationTeacher:
                reactivation.isChristianEducationTeacher,
            }
          : {}),
        ...(reactivation.desiredAreas
          ? { desiredAreas: reactivation.desiredAreas }
          : {}),
      },
    });
  }

  async openRegistryEntry(
    scope: TenantScope,
    entry: NewRegistryEntry,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const startedOn = parseIsoDate(entry.startedOn);
    await client.memberRegistryEntry.updateMany({
      where: {
        denominationId: scope.denominationId,
        memberId: entry.memberId,
        endedOn: null,
      },
      data: { endedOn: startedOn },
    });
    await client.memberRegistryEntry.create({
      data: {
        denominationId: scope.denominationId,
        memberId: entry.memberId,
        congregationId: entry.congregationId,
        memberNumber: entry.memberNumber,
        registryBook: entry.registryBook,
        registryFolio: entry.registryFolio,
        startedOn,
      },
    });
  }

  async recordStatus(
    scope: TenantScope,
    record: StatusRecord,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).memberStatusHistory.create({
      data: {
        denominationId: scope.denominationId,
        memberId: record.memberId,
        userId: record.userId,
        status: record.status,
        startedOn: parseIsoDate(record.startedOn),
        reason: record.reason,
      },
    });
  }

  async recordConsent(
    scope: TenantScope,
    consent: NewConsent,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).dataConsent.create({
      data: {
        denominationId: scope.denominationId,
        personId: consent.personId,
        guardianId: consent.guardianId,
        policyId: consent.policyId,
        channel: 'WEB_FORM',
        grantedAt: consent.grantedAt,
      },
    });
  }

  async linkGuardian(
    scope: TenantScope,
    personId: number,
    guardianPersonId: number,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const existing = await client.familyRelation.findFirst({
      where: {
        denominationId: scope.denominationId,
        personId,
        relativeId: guardianPersonId,
        type: 'GUARDIAN',
      },
      select: { id: true },
    });
    if (!existing) {
      await client.familyRelation.create({
        data: {
          denominationId: scope.denominationId,
          personId,
          relativeId: guardianPersonId,
          type: 'GUARDIAN',
        },
      });
    }
  }

  private async resolveMunicipalityByCode(
    client: Client,
    code: string | null | undefined,
  ): Promise<number | null> {
    if (!code) {
      return null;
    }
    const row = await client.municipality.findFirst({
      where: {
        code,
        region: { country: { isoAlpha2: this.defaultCountryIso } },
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async resolveCatalogs(
    client: Client,
    data: PersonData,
  ): Promise<ResolvedCatalogs> {
    const [
      documentType,
      maritalStatus,
      educationLevel,
      municipalityId,
      documentIssuePlaceId,
      birthPlaceId,
    ] = await Promise.all([
      client.documentType.findUnique({
        where: { code: data.documentTypeCode },
        select: { id: true },
      }),
      data.maritalStatusCode
        ? client.maritalStatus.findUnique({
            where: { code: data.maritalStatusCode },
            select: { id: true },
          })
        : null,
      data.educationLevelCode
        ? client.educationLevel.findUnique({
            where: { code: data.educationLevelCode },
            select: { id: true },
          })
        : null,
      this.resolveMunicipalityByCode(client, data.municipalityCode),
      this.resolveMunicipalityByCode(client, data.documentIssuePlaceCode),
      this.resolveMunicipalityByCode(client, data.birthPlaceCode),
    ]);
    if (!documentType) {
      throw new BusinessRuleException(
        'El tipo de documento de la solicitud no está disponible.',
        'INVALID_CATALOG_VALUE',
      );
    }
    return {
      documentTypeId: documentType.id,
      maritalStatusId: maritalStatus?.id ?? null,
      educationLevelId: educationLevel?.id ?? null,
      municipalityId,
      documentIssuePlaceId,
      birthPlaceId,
    };
  }

  private async addContactsAndAddress(
    client: Client,
    scope: TenantScope,
    personId: number,
    data: PersonData,
    catalog: { municipalityId: number | null },
    include: {
      phone: boolean;
      landlinePhone: boolean;
      email: boolean;
      workPhone: boolean;
      address: boolean;
    },
  ): Promise<void> {
    const { denominationId } = scope;
    if (include.phone && data.phone) {
      await client.personContact.create({
        data: {
          denominationId,
          personId,
          type: 'MOBILE',
          value: data.phone,
          isPrimary: true,
        },
      });
    }
    if (include.landlinePhone && data.landlinePhone) {
      await client.personContact.create({
        data: {
          denominationId,
          personId,
          type: 'LANDLINE',
          value: data.landlinePhone,
          isPrimary: !data.phone,
        },
      });
    }
    if (include.email && data.email) {
      await client.personContact.create({
        data: {
          denominationId,
          personId,
          type: 'EMAIL',
          value: data.email,
          isPrimary: true,
        },
      });
    }
    if (include.workPhone && data.workPhone) {
      await client.personContact.create({
        data: {
          denominationId,
          personId,
          type: 'WORK_PHONE',
          value: data.workPhone,
          isPrimary: false,
        },
      });
    }
    if (include.address && data.address) {
      const neighborhoodId =
        catalog.municipalityId !== null && data.neighborhood
          ? await this.findOrCreateNeighborhood(
              client,
              catalog.municipalityId,
              data.neighborhood,
            )
          : null;
      await client.personAddress.create({
        data: {
          denominationId,
          personId,
          address: data.address,
          municipalityId: catalog.municipalityId,
          neighborhoodId,
          isCurrent: true,
        },
      });
    }
  }

  private async syncFamilyAndMarriage(
    client: Client,
    scope: TenantScope,
    personId: number,
    data: PersonData,
  ): Promise<void> {
    const { denominationId } = scope;

    if (data.fatherFullName) {
      await this.ensureParentRelation(
        client,
        denominationId,
        personId,
        'FATHER',
        'MALE',
        data.fatherFullName,
      );
    }
    if (data.motherFullName) {
      await this.ensureParentRelation(
        client,
        denominationId,
        personId,
        'MOTHER',
        'FEMALE',
        data.motherFullName,
      );
    }
    if (data.childrenNames) {
      const existingChildren = await client.familyRelation.count({
        where: { denominationId, personId, type: 'CHILD' },
      });
      if (existingChildren === 0) {
        const names = data.childrenNames
          .split(/[,;]+/)
          .map((item) => item.trim())
          .filter((item) => item !== '');
        const inverseType = data.sex === 'MALE' ? 'FATHER' : 'MOTHER';
        for (const fullName of names) {
          const child = await client.person.create({
            data: { denominationId, fullName: fullName.slice(0, 200) },
            select: { id: true },
          });
          await client.familyRelation.create({
            data: {
              denominationId,
              personId,
              relativeId: child.id,
              type: 'CHILD',
            },
          });
          await client.familyRelation.create({
            data: {
              denominationId,
              personId: child.id,
              relativeId: personId,
              type: inverseType,
            },
          });
        }
      }
    }

    const hasMarriageInfo =
      Boolean(data.spouseFullName) ||
      Boolean(data.tribunalOpinion) ||
      data.passedEcclesiasticalTribunal !== null &&
        data.passedEcclesiasticalTribunal !== undefined;

    if (hasMarriageInfo) {
      const existingMarriage = await client.marriage.findFirst({
        where: {
          denominationId,
          OR: [{ spouse1Id: personId }, { spouse2Id: personId }],
        },
        select: { id: true },
      });
      if (!existingMarriage) {
        const spouse = await client.person.create({
          data: {
            denominationId,
            fullName: (data.spouseFullName ?? 'Cónyuge').slice(0, 200),
          },
          select: { id: true },
        });
        const spouse1Id = Math.min(personId, spouse.id);
        const spouse2Id = Math.max(personId, spouse.id);
        const tribunalSummary = data.tribunalOpinion
          ? data.passedEcclesiasticalTribunal !== null &&
            data.passedEcclesiasticalTribunal !== undefined
            ? `Tribunal Eclesiástico (${data.passedEcclesiasticalTribunal ? 'Sí' : 'No'}): ${data.tribunalOpinion}`
            : data.tribunalOpinion
          : data.passedEcclesiasticalTribunal !== null &&
              data.passedEcclesiasticalTribunal !== undefined
            ? `Pasó por Tribunal Eclesiástico: ${data.passedEcclesiasticalTribunal ? 'Sí' : 'No'}`
            : null;
        await client.marriage.create({
          data: {
            denominationId,
            spouse1Id,
            spouse2Id,
            isCivil: data.marriageIsCivil ?? false,
            isChristian: data.marriageIsChristian ?? false,
            isCatholic: data.marriageIsCatholic ?? false,
            registeredWith: data.marriageIsChristian
              ? 'CHURCH'
              : data.marriageIsCivil
                ? 'NOTARY'
                : null,
            tribunalOpinion: tribunalSummary
              ? tribunalSummary.slice(0, 255)
              : null,
          },
        });
      }
    }
  }

  private async ensureParentRelation(
    client: Client,
    denominationId: number,
    personId: number,
    type: 'FATHER' | 'MOTHER',
    sex: 'MALE' | 'FEMALE',
    fullName: string,
  ): Promise<void> {
    const existing = await client.familyRelation.findFirst({
      where: { denominationId, personId, type },
      select: { id: true },
    });
    if (existing) {
      return;
    }
    const parent = await client.person.create({
      data: { denominationId, fullName: fullName.slice(0, 200), sex },
      select: { id: true },
    });
    await client.familyRelation.create({
      data: { denominationId, personId, relativeId: parent.id, type },
    });
    await client.familyRelation.create({
      data: {
        denominationId,
        personId: parent.id,
        relativeId: personId,
        type: 'CHILD',
      },
    });
  }

  private async resolveMemberRefs(
    client: Client,
    scope: TenantScope,
    member: {
      baptismMunicipalityCode?: string | null;
      baptizingPastorName?: string | null;
      previousCongregationId?: number | null;
    },
  ): Promise<{
    baptismMunicipalityId: number | null;
    baptizingPastorId: number | null;
    previousCongregationId: number | null;
  }> {
    const [baptismMunicipalityId, previousCongregation, baptizingPastorId] =
      await Promise.all([
        this.resolveMunicipalityByCode(client, member.baptismMunicipalityCode),
        member.previousCongregationId
          ? client.congregation.findFirst({
              where: {
                id: member.previousCongregationId,
                denominationId: scope.denominationId,
                deletedAt: null,
              },
              select: { id: true },
            })
          : null,
        this.findOrCreatePastorPerson(
          client,
          scope.denominationId,
          member.baptizingPastorName,
        ),
      ]);

    return {
      baptismMunicipalityId,
      baptizingPastorId,
      previousCongregationId: previousCongregation?.id ?? null,
    };
  }

  private async findOrCreatePastorPerson(
    client: Client,
    denominationId: number,
    name: string | null | undefined,
  ): Promise<number | null> {
    if (!name || name.trim() === '') {
      return null;
    }
    const clean = name.trim().slice(0, 200);
    const existing = await client.person.findFirst({
      where: {
        denominationId,
        deletedAt: null,
        fullName: clean,
      },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const created = await client.person.create({
      data: { denominationId, fullName: clean },
      select: { id: true },
    });
    return created.id;
  }

  private async syncMemberPositions(
    client: Client,
    scope: TenantScope,
    memberId: number,
    pastPositionsText: string | null | undefined,
    currentPositionsText: string | null | undefined,
    joinedOn: string,
  ): Promise<void> {
    const { denominationId } = scope;
    const parseList = (raw: string | null | undefined): string[] =>
      (raw ?? '')
        .split(/[,;]+/)
        .map((item) => item.trim().slice(0, 80))
        .filter((item) => item.length >= 2);

    const pastNames = parseList(pastPositionsText);
    const currentNames = parseList(currentPositionsText);
    if (pastNames.length === 0 && currentNames.length === 0) {
      return;
    }

    const date = parseIsoDate(joinedOn);
    for (const name of currentNames) {
      const positionId = await this.findOrCreateChurchPosition(
        client,
        denominationId,
        name,
      );
      await client.memberPosition.create({
        data: {
          denominationId,
          memberId,
          positionId,
          startedOn: date,
          endedOn: null,
        },
      });
    }
    for (const name of pastNames) {
      if (
        currentNames.some(
          (current) => current.toLowerCase() === name.toLowerCase(),
        )
      ) {
        continue;
      }
      const positionId = await this.findOrCreateChurchPosition(
        client,
        denominationId,
        name,
      );
      await client.memberPosition.create({
        data: {
          denominationId,
          memberId,
          positionId,
          startedOn: null,
          endedOn: date,
        },
      });
    }
  }

  private async findOrCreateChurchPosition(
    client: Client,
    denominationId: number,
    name: string,
  ): Promise<number> {
    const existing = await client.churchPosition.findUnique({
      where: { denominationId_name: { denominationId, name } },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const created = await client.churchPosition.create({
      data: { denominationId, name, isActive: true },
      select: { id: true },
    });
    return created.id;
  }

  private async findOrCreateNeighborhood(
    client: Client,
    municipalityId: number,
    name: string,
  ): Promise<number> {
    const existing = await client.neighborhood.findUnique({
      where: { municipalityId_name: { municipalityId, name } },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const created = await client.neighborhood.create({
      data: { municipalityId, name },
      select: { id: true },
    });
    return created.id;
  }
}
