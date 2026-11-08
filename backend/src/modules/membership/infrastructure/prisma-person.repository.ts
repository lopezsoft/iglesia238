import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_COUNTRY_ISO } from '../../../common/geo/default-country.js';
import {
  parseIsoDate,
  toIsoDateOrNull,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { ContactType } from '../../../generated/prisma/enums.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  ExistingPerson,
  ResolvedPersonData,
} from '../application/member.models.js';
import type {
  CatalogCodes,
  CatalogResolution,
  CatalogResolver,
  PersonRepository,
} from '../application/ports/person.repository.js';

const PHONE_TYPES: ContactType[] = ['MOBILE', 'LANDLINE'];

const existingSelect = {
  id: true,
  userId: true,
  sex: true,
  birthDate: true,
  member: { select: { status: true, deletedAt: true } },
} satisfies Prisma.PersonSelect;

type ExistingPayload = Prisma.PersonGetPayload<{
  select: typeof existingSelect;
}>;

function toExisting(row: ExistingPayload): ExistingPerson {
  const member =
    row.member && row.member.deletedAt === null ? row.member : null;
  return {
    id: row.id,
    userId: row.userId,
    sex: row.sex,
    birthDate: toIsoDateOrNull(row.birthDate),
    hasMember: member !== null,
    memberStatus: member?.status ?? null,
  };
}

@Injectable()
export class PrismaPersonRepository implements PersonRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findExisting(
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
      select: existingSelect,
    });
    return row ? toExisting(row) : null;
  }

  async findByDocument(
    scope: TenantScope,
    documentTypeId: number,
    documentNumber: string,
    exceptPersonId: number | null,
    transaction?: Transaction,
  ): Promise<ExistingPerson | null> {
    // Soft-deleted persons count too: the unique index does not ignore them.
    const row = await clientOf(this.prisma, transaction).person.findFirst({
      where: {
        denominationId: scope.denominationId,
        documentTypeId,
        documentNumber,
        ...(exceptPersonId === null ? {} : { id: { not: exceptPersonId } }),
      },
      select: existingSelect,
    });
    return row ? toExisting(row) : null;
  }

  async insert(
    scope: TenantScope,
    data: ResolvedPersonData,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const created = await client.person.create({
      data: {
        denominationId: scope.denominationId,
        documentTypeId: data.documentTypeId,
        documentNumber: data.documentNumber,
        documentIssuePlaceId: data.documentIssuePlaceId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        secondLastName: data.secondLastName,
        sex: data.sex,
        birthDate: data.birthDate ? parseIsoDate(data.birthDate) : null,
        birthPlaceId: data.birthPlaceId ?? null,
        maritalStatusId: data.maritalStatusId,
        educationLevelId: data.educationLevelId,
        profession: data.profession,
        occupation: data.occupation,
        workplace: data.workplace ?? null,
        childrenCount: data.childrenCount ?? null,
      },
      select: { id: true },
    });
    await this.syncContacts(client, scope.denominationId, created.id, data);
    return created.id;
  }

  async update(
    scope: TenantScope,
    personId: number,
    data: ResolvedPersonData,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    await client.person.updateMany({
      where: { id: personId, denominationId: scope.denominationId },
      data: {
        documentTypeId: data.documentTypeId,
        documentNumber: data.documentNumber,
        ...(data.documentIssuePlaceId !== undefined
          ? { documentIssuePlaceId: data.documentIssuePlaceId }
          : {}),
        firstName: data.firstName,
        lastName: data.lastName,
        secondLastName: data.secondLastName,
        sex: data.sex,
        birthDate: data.birthDate ? parseIsoDate(data.birthDate) : null,
        ...(data.birthPlaceId !== undefined
          ? { birthPlaceId: data.birthPlaceId }
          : {}),
        maritalStatusId: data.maritalStatusId,
        educationLevelId: data.educationLevelId,
        profession: data.profession,
        occupation: data.occupation,
        ...(data.workplace !== undefined ? { workplace: data.workplace } : {}),
        ...(data.childrenCount !== undefined
          ? { childrenCount: data.childrenCount }
          : {}),
      },
    });
    await this.syncContacts(client, scope.denominationId, personId, data);
  }

  async anonymize(
    scope: TenantScope,
    personId: number,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const { denominationId } = scope;
    await client.person.updateMany({
      where: { id: personId, denominationId },
      data: {
        documentTypeId: null,
        documentNumber: null,
        documentIssuePlaceId: null,
        documentIssuePlaceText: null,
        fullName: null,
        firstName: 'Persona',
        lastName: 'anonimizada',
        secondLastName: null,
        sex: null,
        birthDate: null,
        birthPlaceId: null,
        birthPlaceText: null,
        maritalStatusId: null,
        educationLevelId: null,
        lastGradeCompleted: null,
        profession: null,
        occupation: null,
        workplace: null,
        childrenCount: null,
        photoPath: null,
      },
    });
    await client.personContact.deleteMany({
      where: { personId, denominationId },
    });
    await client.personAddress.deleteMany({
      where: { personId, denominationId },
    });
    await client.socioeconomicProfile.deleteMany({
      where: { personId, denominationId },
    });
    await client.personAttachment.deleteMany({
      where: { personId, denominationId },
    });
  }

  private async syncContacts(
    client: Prisma.TransactionClient,
    denominationId: number,
    personId: number,
    data: ResolvedPersonData,
  ): Promise<void> {
    await this.syncContact(
      client,
      denominationId,
      personId,
      data.landlinePhone !== undefined ? ['MOBILE'] : PHONE_TYPES,
      'MOBILE',
      data.phone,
    );
    if (data.landlinePhone !== undefined) {
      await this.syncContact(
        client,
        denominationId,
        personId,
        ['LANDLINE'],
        'LANDLINE',
        data.landlinePhone,
      );
    }
    await this.syncContact(
      client,
      denominationId,
      personId,
      ['EMAIL'],
      'EMAIL',
      data.email,
    );
    if (data.workPhone !== undefined) {
      await this.syncContact(
        client,
        denominationId,
        personId,
        ['WORK_PHONE'],
        'WORK_PHONE',
        data.workPhone,
      );
    }
    await this.syncAddress(client, denominationId, personId, data);
    await this.syncMarriage(client, denominationId, personId, data);
  }

  private async syncMarriage(
    client: Prisma.TransactionClient,
    denominationId: number,
    personId: number,
    data: ResolvedPersonData,
  ): Promise<void> {
    if (
      data.spouseFullName === undefined &&
      data.marriageIsCivil === undefined &&
      data.marriageIsChristian === undefined &&
      data.marriageIsCatholic === undefined &&
      data.tribunalOpinion === undefined
    ) {
      return;
    }

    const existing = await client.marriage.findFirst({
      where: {
        denominationId,
        endedOn: null,
        OR: [{ spouse1Id: personId }, { spouse2Id: personId }],
      },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        spouse1Id: true,
        spouse2Id: true,
        isCivil: true,
        isChristian: true,
        isCatholic: true,
        tribunalOpinion: true,
      },
    });

    const isCivil = data.marriageIsCivil ?? existing?.isCivil ?? false;
    const isChristian =
      data.marriageIsChristian ?? existing?.isChristian ?? false;
    const isCatholic = data.marriageIsCatholic ?? existing?.isCatholic ?? false;
    const tribunalOpinion =
      data.tribunalOpinion !== undefined
        ? data.tribunalOpinion
          ? data.tribunalOpinion.slice(0, 255)
          : null
        : (existing?.tribunalOpinion ?? null);

    if (existing) {
      const spouseId =
        existing.spouse1Id === personId
          ? existing.spouse2Id
          : existing.spouse1Id;
      if (data.spouseFullName) {
        const spouse = await client.person.findFirst({
          where: { id: spouseId, denominationId },
          select: { id: true, firstName: true, lastName: true },
        });
        if (spouse && !spouse.firstName && !spouse.lastName) {
          await client.person.updateMany({
            where: { id: spouse.id, denominationId },
            data: { fullName: data.spouseFullName.slice(0, 200) },
          });
        }
      }
      await client.marriage.updateMany({
        where: { id: existing.id, denominationId },
        data: {
          isCivil,
          isChristian,
          isCatholic,
          tribunalOpinion,
          registeredWith: isChristian ? 'CHURCH' : isCivil ? 'NOTARY' : null,
        },
      });
      return;
    }

    if (
      !data.spouseFullName &&
      !isCivil &&
      !isChristian &&
      !isCatholic &&
      !tribunalOpinion
    ) {
      return;
    }

    const spouse = await client.person.create({
      data: {
        denominationId,
        fullName: (data.spouseFullName ?? 'Cónyuge').slice(0, 200),
      },
      select: { id: true },
    });
    const spouse1Id = Math.min(personId, spouse.id);
    const spouse2Id = Math.max(personId, spouse.id);
    await client.marriage.create({
      data: {
        denominationId,
        spouse1Id,
        spouse2Id,
        isCivil,
        isChristian,
        isCatholic,
        tribunalOpinion,
        registeredWith: isChristian ? 'CHURCH' : isCivil ? 'NOTARY' : null,
      },
    });
  }

  /** The form edits one phone and one e-mail: the primary contact of that kind. */
  private async syncContact(
    client: Prisma.TransactionClient,
    denominationId: number,
    personId: number,
    kinds: ContactType[],
    createdType: ContactType,
    value: string | null,
  ): Promise<void> {
    const existing = await client.personContact.findFirst({
      where: { personId, denominationId, type: { in: kinds } },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (value === null) {
      if (existing) {
        await client.personContact.delete({ where: { id: existing.id } });
      }
    } else if (existing) {
      await client.personContact.update({
        where: { id: existing.id },
        data: { value, isPrimary: true },
      });
    } else {
      await client.personContact.create({
        data: {
          denominationId,
          personId,
          type: createdType,
          value,
          isPrimary: true,
        },
      });
    }
  }

  private async syncAddress(
    client: Prisma.TransactionClient,
    denominationId: number,
    personId: number,
    data: ResolvedPersonData,
  ): Promise<void> {
    const existing = await client.personAddress.findFirst({
      where: { personId, denominationId, isCurrent: true },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (data.address === null && data.municipalityId === null) {
      if (existing) {
        await client.personAddress.delete({ where: { id: existing.id } });
      }
      return;
    }
    const neighborhoodId =
      data.municipalityId !== null && data.neighborhood
        ? await this.findOrCreateNeighborhood(
            client,
            data.municipalityId,
            data.neighborhood,
          )
        : data.neighborhood === null
          ? null
          : undefined;
    const values = {
      address: data.address ?? '',
      municipalityId: data.municipalityId,
      ...(neighborhoodId !== undefined ? { neighborhoodId } : {}),
    };
    if (existing) {
      await client.personAddress.update({
        where: { id: existing.id },
        data: values,
      });
    } else {
      await client.personAddress.create({
        data: { denominationId, personId, isCurrent: true, ...values },
      });
    }
  }

  private async findOrCreateNeighborhood(
    client: Prisma.TransactionClient,
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

/** Resolves the codes of the global catalogs (document types, marital statuses, municipalities...). */
@Injectable()
export class PrismaCatalogResolver implements CatalogResolver {
  constructor(
    private readonly prisma: PrismaService,
    /** Person addresses arrive as a bare municipality code: it is resolved inside this country. */
    @Inject(DEFAULT_COUNTRY_ISO) private readonly defaultCountryIso: string,
  ) {}

  async resolve(codes: CatalogCodes): Promise<CatalogResolution> {
    const findMuni = (code: string | null | undefined) =>
      !code
        ? null
        : this.prisma.municipality.findFirst({
            where: {
              code,
              region: { country: { isoAlpha2: this.defaultCountryIso } },
            },
            select: { id: true },
          });

    const [
      documentType,
      maritalStatus,
      educationLevel,
      municipality,
      documentIssuePlace,
      birthPlace,
    ] = await Promise.all([
      codes.documentTypeCode === null
        ? null
        : this.prisma.documentType.findUnique({
            where: { code: codes.documentTypeCode },
            select: { id: true },
          }),
      codes.maritalStatusCode === null
        ? null
        : this.prisma.maritalStatus.findUnique({
            where: { code: codes.maritalStatusCode },
            select: { id: true },
          }),
      codes.educationLevelCode === null
        ? null
        : this.prisma.educationLevel.findUnique({
            where: { code: codes.educationLevelCode },
            select: { id: true },
          }),
      findMuni(codes.municipalityCode),
      findMuni(codes.documentIssuePlaceCode),
      findMuni(codes.birthPlaceCode),
    ]);

    const unknown: CatalogResolution['unknown'][number][] = [];
    if (codes.documentTypeCode !== null && !documentType)
      unknown.push('documentType');
    if (codes.maritalStatusCode !== null && !maritalStatus)
      unknown.push('maritalStatus');
    if (codes.educationLevelCode !== null && !educationLevel)
      unknown.push('educationLevel');
    if (codes.municipalityCode !== null && !municipality)
      unknown.push('municipality');
    if (codes.documentIssuePlaceCode && !documentIssuePlace)
      unknown.push('municipality');
    if (codes.birthPlaceCode && !birthPlace) unknown.push('municipality');

    return {
      ids: {
        documentTypeId: documentType?.id ?? null,
        maritalStatusId: maritalStatus?.id ?? null,
        educationLevelId: educationLevel?.id ?? null,
        municipalityId: municipality?.id ?? null,
        ...(codes.documentIssuePlaceCode !== undefined
          ? { documentIssuePlaceId: documentIssuePlace?.id ?? null }
          : {}),
        ...(codes.birthPlaceCode !== undefined
          ? { birthPlaceId: birthPlace?.id ?? null }
          : {}),
      },
      unknown,
    };
  }

  async studyTypeId(code: string): Promise<number | null> {
    const row = await this.prisma.studyType.findUnique({
      where: { code },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
