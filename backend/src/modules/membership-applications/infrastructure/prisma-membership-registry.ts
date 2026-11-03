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
        firstName: data.firstName,
        lastName: data.lastName,
        secondLastName: data.secondLastName,
        sex: data.sex,
        birthDate: data.birthDate ? parseIsoDate(data.birthDate) : null,
        maritalStatusId: catalog.maritalStatusId,
        occupation: data.occupation,
      },
      select: { id: true },
    });
    await this.addContactsAndAddress(client, scope, person.id, data, catalog, {
      phone: true,
      email: true,
      address: true,
    });
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
        maritalStatusId: true,
        occupation: true,
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
    if (current.maritalStatusId === null && catalog.maritalStatusId !== null) {
      fill.maritalStatusId = catalog.maritalStatusId;
    }
    if (!current.occupation && data.occupation)
      fill.occupation = data.occupation;
    if (Object.keys(fill).length > 0) {
      await client.person.update({ where: { id: personId }, data: fill });
    }

    await this.addContactsAndAddress(client, scope, personId, data, catalog, {
      phone: !current.personContacts.some((c) => c.type === 'MOBILE'),
      email: !current.personContacts.some((c) => c.type === 'EMAIL'),
      address: current.personAddresses.length === 0,
    });
  }

  async createMember(
    scope: TenantScope,
    member: NewMember,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(this.prisma, transaction).member.create({
      data: {
        denominationId: scope.denominationId,
        personId: member.personId,
        congregationId: member.congregationId,
        status: 'ACTIVE',
        joinedOn: parseIsoDate(member.joinedOn),
        previousCongregationName: member.previousCongregationName,
        isBaptized: member.isBaptized,
      },
      select: { id: true },
    });
    return created.id;
  }

  async reactivateMember(
    scope: TenantScope,
    reactivation: MemberReactivation,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).member.updateMany({
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

  private async resolveCatalogs(
    client: Client,
    data: PersonData,
  ): Promise<{
    documentTypeId: number;
    maritalStatusId: number | null;
    municipalityId: number | null;
  }> {
    const [documentType, maritalStatus, municipality] = await Promise.all([
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
      data.municipalityCode
        ? client.municipality.findFirst({
            where: {
              code: data.municipalityCode,
              region: { country: { isoAlpha2: this.defaultCountryIso } },
            },
            select: { id: true },
          })
        : null,
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
      municipalityId: municipality?.id ?? null,
    };
  }

  private async addContactsAndAddress(
    client: Client,
    scope: TenantScope,
    personId: number,
    data: PersonData,
    catalog: { municipalityId: number | null },
    include: { phone: boolean; email: boolean; address: boolean },
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
