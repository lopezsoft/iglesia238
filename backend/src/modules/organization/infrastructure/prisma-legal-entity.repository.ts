import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  LegalEntityData,
  LegalEntityRecord,
  LegalEntityRepository,
} from '../application/organization.ports.js';

const WITH_MUNICIPALITY = {
  country: { select: { name: true } },
  municipality: {
    select: {
      code: true,
      name: true,
      region: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.LegalEntityInclude;

type LegalEntityRow = Prisma.LegalEntityGetPayload<{
  include: typeof WITH_MUNICIPALITY;
}>;

function toRecord(row: LegalEntityRow): LegalEntityRecord {
  return {
    id: row.id,
    denominationId: row.denominationId,
    legalName: row.legalName,
    tradeName: row.tradeName,
    taxId: row.taxId,
    legalRepresentative: row.legalRepresentative,
    email: row.email,
    phone: row.phone,
    address: row.address,
    countryId: row.countryId,
    countryName: row.country.name,
    municipalityCode: row.municipality?.code ?? null,
    municipalityName: row.municipality?.name ?? null,
    regionCode: row.municipality?.region.code ?? null,
    regionName: row.municipality?.region.name ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaLegalEntityRepository
  extends TenantScopedRepository
  implements LegalEntityRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private whereOf(scope: TenantScope, extra: object = {}) {
    return { ...extra, denominationId: scope.denominationId, deletedAt: null };
  }

  async list(scope: TenantScope): Promise<LegalEntityRecord[]> {
    const rows = await this.prisma.legalEntity.findMany({
      where: this.whereOf(scope),
      include: WITH_MUNICIPALITY,
      orderBy: [{ legalName: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findById(
    scope: TenantScope,
    id: number,
  ): Promise<LegalEntityRecord | null> {
    const row = await this.prisma.legalEntity.findFirst({
      where: this.whereOf(scope, { id }),
      include: WITH_MUNICIPALITY,
    });
    return row ? toRecord(row) : null;
  }

  async taxIdExists(taxId: string, exceptId: number | null): Promise<boolean> {
    // Deleted rows keep their NIT occupied: the column is unique for all rows.
    const count = await this.prisma.legalEntity.count({
      where: { taxId, ...(exceptId === null ? {} : { id: { not: exceptId } }) },
    });
    return count > 0;
  }

  countActiveCongregations(scope: TenantScope, id: number): Promise<number> {
    return this.prisma.congregation.count({
      where: {
        denominationId: scope.denominationId,
        legalEntityId: id,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  countCongregations(scope: TenantScope, id: number): Promise<number> {
    return this.prisma.congregation.count({
      where: {
        denominationId: scope.denominationId,
        legalEntityId: id,
        deletedAt: null,
      },
    });
  }

  async create(
    scope: TenantScope,
    data: LegalEntityData,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(this.prisma, transaction).legalEntity.create(
      {
        data: { denominationId: scope.denominationId, ...data },
        select: { id: true },
      },
    );
    return created.id;
  }

  async update(
    scope: TenantScope,
    id: number,
    data: LegalEntityData,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).legalEntity.updateMany({
      where: this.whereOf(scope, { id }),
      data,
    });
  }

  async setActive(
    scope: TenantScope,
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).legalEntity.updateMany({
      where: this.whereOf(scope, { id }),
      data: { isActive },
    });
  }
}
