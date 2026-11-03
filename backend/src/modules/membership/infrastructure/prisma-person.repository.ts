import { Injectable } from '@nestjs/common';
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

const COLOMBIA = 'CO';
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
        firstName: data.firstName,
        lastName: data.lastName,
        secondLastName: data.secondLastName,
        sex: data.sex,
        birthDate: data.birthDate ? parseIsoDate(data.birthDate) : null,
        maritalStatusId: data.maritalStatusId,
        educationLevelId: data.educationLevelId,
        profession: data.profession,
        occupation: data.occupation,
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
        firstName: data.firstName,
        lastName: data.lastName,
        secondLastName: data.secondLastName,
        sex: data.sex,
        birthDate: data.birthDate ? parseIsoDate(data.birthDate) : null,
        maritalStatusId: data.maritalStatusId,
        educationLevelId: data.educationLevelId,
        profession: data.profession,
        occupation: data.occupation,
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
      PHONE_TYPES,
      'MOBILE',
      data.phone,
    );
    await this.syncContact(
      client,
      denominationId,
      personId,
      ['EMAIL'],
      'EMAIL',
      data.email,
    );
    await this.syncAddress(client, denominationId, personId, data);
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
    const values = {
      address: data.address ?? '',
      municipalityId: data.municipalityId,
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
}

/** Resolves the codes of the global catalogs (document types, marital statuses, municipalities...). */
@Injectable()
export class PrismaCatalogResolver implements CatalogResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(codes: CatalogCodes): Promise<CatalogResolution> {
    const [documentType, maritalStatus, educationLevel, municipality] =
      await Promise.all([
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
        codes.municipalityCode === null
          ? null
          : this.prisma.municipality.findFirst({
              where: {
                code: codes.municipalityCode,
                region: { country: { isoAlpha2: COLOMBIA } },
              },
              select: { id: true },
            }),
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

    return {
      ids: {
        documentTypeId: documentType?.id ?? null,
        maritalStatusId: maritalStatus?.id ?? null,
        educationLevelId: educationLevel?.id ?? null,
        municipalityId: municipality?.id ?? null,
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
