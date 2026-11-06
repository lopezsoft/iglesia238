import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { PrismaTransaction } from '../../../infrastructure/prisma/prisma-transaction.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CongregationData,
  LegalEntityData,
} from '../application/organization.ports.js';
import { PrismaCongregationRepository } from './prisma-congregation.repository.js';
import { PrismaLegalEntityRepository } from './prisma-legal-entity.repository.js';

describe('PrismaLegalEntityRepository', () => {
  it('writes only LegalEntityData columns and strips transient fields like municipalityCode', async () => {
    const createCalls: unknown[] = [];
    const updateCalls: unknown[] = [];
    const prisma = {
      legalEntity: {
        create: (args: unknown) => {
          createCalls.push(args);
          return Promise.resolve({ id: 7 });
        },
        updateMany: (args: unknown) => {
          updateCalls.push(args);
          return Promise.resolve({ count: 1 });
        },
      },
    } as unknown as PrismaService;
    const transaction = new PrismaTransaction(prisma as never);

    const repository = new PrismaLegalEntityRepository(prisma);
    const scope = TenantScope.of(1);
    const payloadWithExtra = {
      legalName: 'IPUC',
      tradeName: null,
      taxId: '890.102.513-4',
      legalRepresentative: 'ZACARIAS PALACIO',
      countryId: 46,
      municipalityId: 501,
      municipalityCode: '11001',
      email: null,
      phone: null,
      address: null,
    } as unknown as LegalEntityData;

    await repository.create(scope, payloadWithExtra, transaction);
    await repository.update(scope, 7, payloadWithExtra, transaction);

    expect(createCalls[0]).toEqual({
      data: {
        denominationId: 1,
        legalName: 'IPUC',
        tradeName: null,
        taxId: '890.102.513-4',
        legalRepresentative: 'ZACARIAS PALACIO',
        countryId: 46,
        municipalityId: 501,
        email: null,
        phone: null,
        address: null,
      },
      select: { id: true },
    });
    expect(updateCalls[0]).toEqual({
      where: { id: 7, denominationId: 1, deletedAt: null },
      data: {
        legalName: 'IPUC',
        tradeName: null,
        taxId: '890.102.513-4',
        legalRepresentative: 'ZACARIAS PALACIO',
        countryId: 46,
        municipalityId: 501,
        email: null,
        phone: null,
        address: null,
      },
    });
  });
});

describe('PrismaCongregationRepository', () => {
  it('writes only CongregationData columns and strips transient fields like municipalityCode and neighborhood', async () => {
    const createCalls: unknown[] = [];
    const updateCalls: unknown[] = [];
    const prisma = {
      congregation: {
        create: (args: unknown) => {
          createCalls.push(args);
          return Promise.resolve({ id: 12 });
        },
        updateMany: (args: unknown) => {
          updateCalls.push(args);
          return Promise.resolve({ count: 1 });
        },
      },
    } as unknown as PrismaService;
    const transaction = new PrismaTransaction(prisma as never);

    const repository = new PrismaCongregationRepository(prisma);
    const scope = TenantScope.of(1);
    const payloadWithExtra = {
      name: 'Sede Central',
      code: 'SC',
      legalEntityId: 7,
      districtId: null,
      municipalityId: 501,
      municipalityCode: '11001',
      neighborhood: 'Centro',
      neighborhoodId: 9,
      address: 'Calle 10 # 5-20',
      phone: null,
      email: null,
      acceptsApplications: true,
    } as unknown as CongregationData;

    await repository.create(scope, payloadWithExtra, transaction);
    await repository.update(scope, 12, payloadWithExtra, transaction);

    expect(createCalls[0]).toEqual({
      data: {
        denominationId: 1,
        name: 'Sede Central',
        code: 'SC',
        legalEntityId: 7,
        districtId: null,
        municipalityId: 501,
        neighborhoodId: 9,
        address: 'Calle 10 # 5-20',
        phone: null,
        email: null,
        acceptsApplications: true,
      },
      select: { id: true },
    });
    expect(updateCalls[0]).toEqual({
      where: { id: 12, denominationId: 1, deletedAt: null },
      data: {
        name: 'Sede Central',
        code: 'SC',
        legalEntityId: 7,
        districtId: null,
        municipalityId: 501,
        neighborhoodId: 9,
        address: 'Calle 10 # 5-20',
        phone: null,
        email: null,
        acceptsApplications: true,
      },
    });
  });
});
