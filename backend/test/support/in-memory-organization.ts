import type { TenantScope } from '../../src/common/tenancy/tenant-scope.js';
import type {
  CongregationData,
  CongregationRecord,
  CongregationRepository,
  DistrictData,
  DistrictRecord,
  DistrictRepository,
  GeoRepository,
  LegalEntityData,
  LegalEntityRecord,
  LegalEntityRepository,
  MunicipalityRef,
  NeighborhoodRef,
} from '../../src/modules/organization/application/organization.ports.js';

export const CARTAGENA: MunicipalityRef = {
  id: 1,
  code: '13001',
  name: 'Cartagena de Indias',
  regionName: 'Bolívar',
};
export const BOGOTA: MunicipalityRef = {
  id: 2,
  code: '11001',
  name: 'Bogotá, D.C.',
  regionName: 'Bogotá, D.C.',
};

/** One shared "database" so the fakes of the three aggregates can see each other like the tables do. */
export class InMemoryOrganization {
  readonly municipalities = [CARTAGENA, BOGOTA];
  readonly neighborhoods: (NeighborhoodRef & { municipalityId: number })[] = [];
  legalEntities: (LegalEntityRecord & { rawTaxId: string })[] = [];
  districts: Omit<DistrictRecord, 'congregationNames'>[] = [];
  congregations: (CongregationRecord & {
    municipalityId: number | null;
    neighborhoodId: number | null;
  })[] = [];
  private sequence = 100;

  nextId(): number {
    return (this.sequence += 1);
  }

  municipality(id: number | null): MunicipalityRef | undefined {
    return this.municipalities.find((row) => row.id === id);
  }

  addLegalEntity(
    denominationId: number,
    values: Partial<LegalEntityRecord> = {},
  ): LegalEntityRecord {
    const id = this.nextId();
    const row = {
      id,
      denominationId,
      legalName: `Razón social ${id}`,
      tradeName: null,
      taxId: `900.${String(id).padStart(3, '0')}.000-1`,
      rawTaxId: '',
      legalRepresentative: 'Representante',
      email: null,
      phone: null,
      address: null,
      municipalityCode: CARTAGENA.code,
      municipalityName: CARTAGENA.name,
      regionName: CARTAGENA.regionName,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...values,
    };
    this.legalEntities.push(row);
    return row;
  }

  addDistrict(
    denominationId: number,
    values: Partial<DistrictRecord> = {},
  ): DistrictRecord {
    const id = this.nextId();
    const row = {
      id,
      denominationId,
      number: String(id),
      name: null,
      ...values,
    };
    this.districts.push(row);
    return { ...row, congregationNames: [] };
  }

  addCongregation(
    denominationId: number,
    legalEntityId: number,
    values: Partial<CongregationRecord> = {},
  ): CongregationRecord {
    const id = this.nextId();
    const row = {
      id,
      denominationId,
      legalEntityId,
      legalEntityName:
        this.legalEntities.find((e) => e.id === legalEntityId)?.legalName ?? '',
      districtId: null,
      districtNumber: null,
      code: `S${id}`,
      name: `Sede ${id}`,
      municipalityCode: CARTAGENA.code,
      municipalityName: CARTAGENA.name,
      regionName: CARTAGENA.regionName,
      neighborhood: null,
      address: 'Calle 1',
      phone: null,
      email: null,
      acceptsApplications: true,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      municipalityId: CARTAGENA.id,
      neighborhoodId: null,
      ...values,
    };
    this.congregations.push(row);
    return row;
  }
}

export class InMemoryLegalEntityRepository implements LegalEntityRepository {
  constructor(private readonly world: InMemoryOrganization) {}

  list(scope: TenantScope) {
    return Promise.resolve(
      this.world.legalEntities.filter(
        (row) => row.denominationId === scope.denominationId,
      ),
    );
  }

  findById(scope: TenantScope, id: number) {
    return Promise.resolve(
      this.world.legalEntities.find(
        (row) => row.id === id && row.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  taxIdExists(taxId: string, exceptId: number | null) {
    return Promise.resolve(
      this.world.legalEntities.some(
        (row) => row.taxId === taxId && row.id !== exceptId,
      ),
    );
  }

  countActiveCongregations(scope: TenantScope, id: number) {
    return Promise.resolve(
      this.world.congregations.filter(
        (row) =>
          row.denominationId === scope.denominationId &&
          row.legalEntityId === id &&
          row.isActive,
      ).length,
    );
  }

  create(scope: TenantScope, data: LegalEntityData) {
    const row = this.world.addLegalEntity(
      scope.denominationId,
      this.toRecordFields(data),
    );
    return Promise.resolve(row.id);
  }

  update(scope: TenantScope, id: number, data: LegalEntityData) {
    this.replace(scope, id, this.toRecordFields(data));
    return Promise.resolve();
  }

  setActive(scope: TenantScope, id: number, isActive: boolean) {
    this.replace(scope, id, { isActive });
    return Promise.resolve();
  }

  private toRecordFields(data: LegalEntityData): Partial<LegalEntityRecord> {
    const municipality = this.world.municipality(data.municipalityId);
    return {
      legalName: data.legalName,
      tradeName: data.tradeName,
      taxId: data.taxId,
      legalRepresentative: data.legalRepresentative,
      email: data.email,
      phone: data.phone,
      address: data.address,
      municipalityCode: municipality?.code ?? null,
      municipalityName: municipality?.name ?? null,
      regionName: municipality?.regionName ?? null,
    };
  }

  private replace(
    scope: TenantScope,
    id: number,
    change: Partial<LegalEntityRecord>,
  ) {
    const index = this.world.legalEntities.findIndex(
      (row) => row.id === id && row.denominationId === scope.denominationId,
    );
    this.world.legalEntities[index] = {
      ...this.world.legalEntities[index],
      ...change,
    };
  }
}

export class InMemoryDistrictRepository implements DistrictRepository {
  constructor(private readonly world: InMemoryOrganization) {}

  list(scope: TenantScope) {
    return Promise.resolve(
      this.world.districts
        .filter((row) => row.denominationId === scope.denominationId)
        .map((row) => this.withNames(row)),
    );
  }

  async findById(scope: TenantScope, id: number) {
    return (await this.list(scope)).find((row) => row.id === id) ?? null;
  }

  create(scope: TenantScope, data: DistrictData) {
    return Promise.resolve(
      this.world.addDistrict(scope.denominationId, data).id,
    );
  }

  update(scope: TenantScope, id: number, data: DistrictData) {
    const index = this.world.districts.findIndex(
      (row) => row.id === id && row.denominationId === scope.denominationId,
    );
    this.world.districts[index] = { ...this.world.districts[index], ...data };
    return Promise.resolve();
  }

  private withNames(
    row: Omit<DistrictRecord, 'congregationNames'>,
  ): DistrictRecord {
    return {
      ...row,
      congregationNames: this.world.congregations
        .filter((c) => c.districtId === row.id)
        .map((c) => c.name),
    };
  }
}

export class InMemoryCongregationRepository implements CongregationRepository {
  constructor(private readonly world: InMemoryOrganization) {}

  list(scope: TenantScope) {
    return Promise.resolve(
      this.world.congregations.filter(
        (row) => row.denominationId === scope.denominationId,
      ),
    );
  }

  async findById(scope: TenantScope, id: number) {
    return (await this.list(scope)).find((row) => row.id === id) ?? null;
  }

  async listSelectable(scope: TenantScope) {
    return (await this.list(scope)).filter(
      (row) =>
        row.isActive &&
        (scope.congregationId === null || row.id === scope.congregationId),
    );
  }

  async listIdentifiers(scope: TenantScope) {
    return (await this.list(scope)).map(({ id, name, code }) => ({
      id,
      name,
      code,
    }));
  }

  create(scope: TenantScope, data: CongregationData) {
    const row = this.world.addCongregation(
      scope.denominationId,
      data.legalEntityId,
      this.toRecordFields(data),
    );
    return Promise.resolve(row.id);
  }

  update(scope: TenantScope, id: number, data: CongregationData) {
    this.replace(scope, id, this.toRecordFields(data));
    return Promise.resolve();
  }

  patch(
    scope: TenantScope,
    id: number,
    change: { isActive?: boolean; acceptsApplications?: boolean },
  ) {
    this.replace(scope, id, change);
    return Promise.resolve();
  }

  private toRecordFields(data: CongregationData): Partial<CongregationRecord> {
    const municipality = this.world.municipality(data.municipalityId);
    const district = this.world.districts.find(
      (row) => row.id === data.districtId,
    );
    return {
      name: data.name,
      code: data.code,
      legalEntityId: data.legalEntityId,
      districtId: data.districtId,
      districtNumber: district?.number ?? null,
      municipalityCode: municipality?.code ?? null,
      municipalityName: municipality?.name ?? null,
      regionName: municipality?.regionName ?? null,
      neighborhood:
        this.world.neighborhoods.find((row) => row.id === data.neighborhoodId)
          ?.name ?? null,
      address: data.address,
      phone: data.phone,
      email: data.email,
      acceptsApplications: data.acceptsApplications,
    };
  }

  private replace(
    scope: TenantScope,
    id: number,
    change: Partial<CongregationRecord>,
  ) {
    const index = this.world.congregations.findIndex(
      (row) => row.id === id && row.denominationId === scope.denominationId,
    );
    this.world.congregations[index] = {
      ...this.world.congregations[index],
      ...change,
    };
  }
}

export class InMemoryGeoRepository implements GeoRepository {
  constructor(private readonly world: InMemoryOrganization) {}

  findMunicipalityByCode(code: string) {
    return Promise.resolve(
      this.world.municipalities.find((row) => row.code === code) ?? null,
    );
  }

  findOrCreateNeighborhood(municipalityId: number, name: string) {
    const existing = this.world.neighborhoods.find(
      (row) =>
        row.municipalityId === municipalityId &&
        row.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      return Promise.resolve({ id: existing.id, name: existing.name });
    }
    const created = { id: this.world.nextId(), name, municipalityId };
    this.world.neighborhoods.push(created);
    return Promise.resolve({ id: created.id, name: created.name });
  }
}
