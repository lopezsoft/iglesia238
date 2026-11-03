import {
  ConflictDomainException,
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import {
  InMemoryCongregationRepository,
  InMemoryDistrictRepository,
  InMemoryGeoRepository,
  InMemoryLegalEntityRepository,
  InMemoryOrganization,
} from '../../../../test/support/in-memory-organization.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  CongregationInputValidator,
  CreateCongregationUseCase,
  ListCongregationsUseCase,
  ListSelectableCongregationsUseCase,
  SetAcceptsApplicationsUseCase,
  SetCongregationActiveUseCase,
  UpdateCongregationUseCase,
  type CongregationInput,
} from './congregations.use-cases.js';
import {
  CreateDistrictUseCase,
  ListDistrictsUseCase,
  UpdateDistrictUseCase,
} from './districts.use-cases.js';
import {
  CreateLegalEntityUseCase,
  LegalEntityInputValidator,
  ListLegalEntitiesUseCase,
  SetLegalEntityActiveUseCase,
  UpdateLegalEntityUseCase,
  type LegalEntityInput,
} from './legal-entities.use-cases.js';
import { GetCongregationFormOptionsUseCase } from './organization-queries.use-cases.js';

const admin1 = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 1,
  permissions: ['congregations.manage'],
});
const admin1InSede = buildTenantContext({
  kind: 'CONGREGATION',
  denominationId: 1,
  congregationId: 10,
  permissions: ['congregations.manage'],
});
const admin2 = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 2,
  permissions: ['congregations.manage'],
});
const platform = buildTenantContext({ kind: 'PLATFORM' });

function build() {
  const world = new InMemoryOrganization();
  const congregations = new InMemoryCongregationRepository(world);
  const legalEntities = new InMemoryLegalEntityRepository(world);
  const districts = new InMemoryDistrictRepository(world);
  const geo = new InMemoryGeoRepository(world);
  const audit = new RecordingAuditRecorder();
  const transactions = new ImmediateTransactionRunner();
  const congregationValidator = new CongregationInputValidator(
    congregations,
    legalEntities,
    districts,
    geo,
  );
  const legalEntityValidator = new LegalEntityInputValidator(
    legalEntities,
    geo,
  );

  // Denomination 1 has an entity, a district and a sede; denomination 2 has its own.
  const entity1 = world.addLegalEntity(1, {
    legalName: 'Corporación Monte de Sión',
  });
  const district1 = world.addDistrict(1, { number: '2' });
  const sede1 = world.addCongregation(1, entity1.id, {
    name: 'Sede Central',
    code: 'SC',
    districtId: district1.id,
    districtNumber: '2',
  });
  const entity2 = world.addLegalEntity(2, {
    legalName: 'Corporación Vida Nueva',
  });
  const district2 = world.addDistrict(2, { number: '1' });
  const sede2 = world.addCongregation(2, entity2.id, {
    name: 'Sede Vida',
    code: 'SV',
  });

  return {
    world,
    audit,
    entity1,
    entity2,
    district1,
    district2,
    sede1,
    sede2,
    listCongregations: new ListCongregationsUseCase(congregations),
    selectable: new ListSelectableCongregationsUseCase(congregations),
    createCongregation: new CreateCongregationUseCase(
      congregations,
      geo,
      congregationValidator,
      transactions,
      audit,
    ),
    updateCongregation: new UpdateCongregationUseCase(
      congregations,
      geo,
      congregationValidator,
      transactions,
      audit,
    ),
    setActive: new SetCongregationActiveUseCase(
      congregations,
      transactions,
      audit,
    ),
    setAccepts: new SetAcceptsApplicationsUseCase(
      congregations,
      transactions,
      audit,
    ),
    listLegalEntities: new ListLegalEntitiesUseCase(legalEntities),
    createLegalEntity: new CreateLegalEntityUseCase(
      legalEntities,
      legalEntityValidator,
      transactions,
      audit,
    ),
    updateLegalEntity: new UpdateLegalEntityUseCase(
      legalEntities,
      legalEntityValidator,
      transactions,
      audit,
    ),
    setLegalEntityActive: new SetLegalEntityActiveUseCase(
      legalEntities,
      transactions,
      audit,
    ),
    listDistricts: new ListDistrictsUseCase(districts),
    createDistrict: new CreateDistrictUseCase(districts, transactions, audit),
    updateDistrict: new UpdateDistrictUseCase(districts, transactions, audit),
    formOptions: new GetCongregationFormOptionsUseCase(
      legalEntities,
      districts,
    ),
  };
}

function sede(
  overrides: Partial<CongregationInput> & { legalEntityId: number },
): CongregationInput {
  return {
    name: 'Sede Chía',
    districtId: null,
    municipalityCode: '13001',
    neighborhood: 'Centro',
    address: 'Calle 10 # 5-20',
    phone: null,
    email: 'Chia@MonteDeSion.example',
    acceptsApplications: true,
    ...overrides,
  };
}

function entity(overrides: Partial<LegalEntityInput> = {}): LegalEntityInput {
  return {
    legalName: 'Corporación Educativa',
    tradeName: null,
    taxId: '902111222-3',
    legalRepresentative: 'Representante',
    municipalityCode: '11001',
    email: null,
    phone: null,
    address: null,
    ...overrides,
  };
}

const command = { ipAddress: '10.1.1.1' };

describe('tenant isolation (congregations)', () => {
  it('lists only the sedes of the denomination of the session', async () => {
    const { listCongregations, sede1, sede2 } = build();

    const first = await listCongregations.execute(admin1);
    const second = await listCongregations.execute(admin2);

    expect(first.map((row) => row.id)).toEqual([sede1.id]);
    expect(second.map((row) => row.id)).toEqual([sede2.id]);
  });

  it('keeps acting on the whole denomination when a sede is selected', async () => {
    const { listCongregations, world, entity1 } = build();
    world.addCongregation(1, entity1.id, { name: 'Otra sede' });

    const rows = await listCongregations.execute(admin1InSede);

    expect(rows).toHaveLength(2);
  });

  it('answers 404 to writes on a sede of another denomination', async () => {
    const { setActive, updateCongregation, sede1, entity2, world } = build();

    await expect(
      setActive.execute({
        ...command,
        context: admin2,
        id: sede1.id,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      updateCongregation.execute({
        ...command,
        context: admin2,
        id: sede1.id,
        input: sede({ legalEntityId: entity2.id }),
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(
      world.congregations.find((row) => row.id === sede1.id)?.isActive,
    ).toBe(true);
  });

  it('rejects a legal entity or a district of another denomination as not found', async () => {
    const { createCongregation, entity1, entity2, district2 } = build();

    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity2.id }),
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity1.id, districtId: district2.id }),
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('is closed to the platform scope', async () => {
    const { listCongregations, createCongregation, entity1 } = build();

    await expect(listCongregations.execute(platform)).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
    await expect(
      createCongregation.execute({
        ...command,
        context: platform,
        input: sede({ legalEntityId: entity1.id }),
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});

describe('selectable congregations', () => {
  it('gives a sede role its own sede and a denomination role every active sede', async () => {
    const { selectable, world, entity1, sede1 } = build();
    const other = world.addCongregation(1, entity1.id, { name: 'Sede Norte' });
    world.addCongregation(1, entity1.id, {
      name: 'Sede Cerrada',
      isActive: false,
    });
    const inSede = buildTenantContext({
      kind: 'CONGREGATION',
      denominationId: 1,
      congregationId: other.id,
    });

    expect((await selectable.execute(inSede)).map((row) => row.id)).toEqual([
      other.id,
    ]);
    expect(
      (await selectable.execute(admin1)).map((row) => row.id).sort(),
    ).toEqual([sede1.id, other.id].sort());
  });

  it('never shows the sedes of another denomination and rejects the platform scope', async () => {
    const { selectable, sede2 } = build();

    expect(
      (await selectable.execute(admin1)).map((row) => row.id),
    ).not.toContain(sede2.id);
    await expect(selectable.execute(platform)).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });
});

describe('CreateCongregationUseCase', () => {
  it('creates the sede with a generated code, resolves the municipality and audits without personal data', async () => {
    const { createCongregation, entity1, audit, world } = build();

    const created = await createCongregation.execute({
      ...command,
      context: admin1,
      input: sede({ legalEntityId: entity1.id, name: '  Sede   Chía ' }),
    });

    expect(created).toMatchObject({
      name: 'Sede Chía',
      code: 'CHI',
      municipalityCode: '13001',
      municipalityName: 'Cartagena de Indias',
      regionName: 'Bolívar',
      neighborhood: 'Centro',
      email: 'chia@montedesion.example',
      isActive: true,
    });
    expect(world.neighborhoods).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'CREATE',
      entity: 'Congregation',
      entityId: created.id,
      congregationId: created.id,
      ipAddress: '10.1.1.1',
    });
    expect(JSON.stringify(audit.entries[0].changes)).not.toMatch(
      /Calle|chia@/i,
    );
  });

  it('rejects a duplicate name ignoring case and accents, but allows it in another denomination', async () => {
    const { createCongregation, entity1, entity2 } = build();

    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity1.id, name: 'SEDE CENTRAL' }),
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
    await expect(
      createCongregation.execute({
        ...command,
        context: admin2,
        input: sede({ legalEntityId: entity2.id, name: 'Sede Central' }),
      }),
    ).resolves.toMatchObject({ name: 'Sede Central' });
  });

  it('refuses an inactive legal entity, an unknown municipality and a bad email', async () => {
    const { createCongregation, world, entity1 } = build();
    const inactive = world.addLegalEntity(1, { isActive: false });

    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: inactive.id }),
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_ENTITY_INACTIVE' });
    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity1.id, municipalityCode: '99999' }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MUNICIPALITY' });
    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity1.id, email: 'not-an-email' }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
  });

  it('uses the requested code when it is free and rejects a taken or invalid one', async () => {
    const { createCongregation, entity1 } = build();

    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity1.id, code: 'ch-1' }),
      }),
    ).resolves.toMatchObject({ code: 'CH1' });
    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity1.id, name: 'Otra', code: 'sc' }),
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_CODE' });
    await expect(
      createCongregation.execute({
        ...command,
        context: admin1,
        input: sede({ legalEntityId: entity1.id, name: 'Otra', code: 'X' }),
      }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
});

describe('UpdateCongregationUseCase', () => {
  it('keeps the code when the sede is renamed and audits only what changed', async () => {
    const { updateCongregation, sede1, entity1, audit } = build();

    const updated = await updateCongregation.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      input: sede({
        legalEntityId: entity1.id,
        districtId: sede1.districtId,
        name: 'Sede Principal',
      }),
    });

    expect(updated).toMatchObject({ name: 'Sede Principal', code: 'SC' });
    expect(audit.entries[0]).toMatchObject({
      action: 'UPDATE',
      changes: { name: { from: 'Sede Central', to: 'Sede Principal' } },
    });
  });

  it('may keep its own inactive legal entity but not move to another inactive one', async () => {
    const { updateCongregation, world, sede1 } = build();
    const inactive = world.addLegalEntity(1, { isActive: false });
    const otherInactive = world.addLegalEntity(1, { isActive: false });
    const index = world.congregations.findIndex((row) => row.id === sede1.id);
    world.congregations[index] = {
      ...world.congregations[index],
      legalEntityId: inactive.id,
    };

    await expect(
      updateCongregation.execute({
        ...command,
        context: admin1,
        id: sede1.id,
        input: sede({ legalEntityId: inactive.id, name: 'Sede Central' }),
      }),
    ).resolves.toMatchObject({ legalEntityId: inactive.id });
    await expect(
      updateCongregation.execute({
        ...command,
        context: admin1,
        id: sede1.id,
        input: sede({ legalEntityId: otherInactive.id, name: 'Sede Central' }),
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_ENTITY_INACTIVE' });
  });

  it('does not reopen applications of an inactive sede through the form', async () => {
    const { updateCongregation, setActive, sede1, entity1 } = build();
    await setActive.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      isActive: false,
    });

    const updated = await updateCongregation.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      input: sede({
        legalEntityId: entity1.id,
        name: 'Sede Central',
        acceptsApplications: true,
      }),
    });

    expect(updated.acceptsApplications).toBe(false);
  });
});

describe('SetCongregationActiveUseCase and SetAcceptsApplicationsUseCase', () => {
  it('deactivating closes applications and activating does not reopen them', async () => {
    const { setActive, sede1, audit } = build();

    const closed = await setActive.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      isActive: false,
    });
    const reopened = await setActive.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      isActive: true,
    });

    expect(closed).toMatchObject({
      isActive: false,
      acceptsApplications: false,
    });
    expect(reopened).toMatchObject({
      isActive: true,
      acceptsApplications: false,
    });
    expect(audit.entries.map((entry) => entry.action)).toEqual([
      'DEACTIVATE',
      'ACTIVATE',
    ]);
  });

  it('is idempotent', async () => {
    const { setActive, sede1, audit } = build();

    await setActive.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      isActive: true,
    });

    expect(audit.entries).toHaveLength(0);
  });

  it('refuses to open applications of an inactive sede', async () => {
    const { setActive, setAccepts, sede1 } = build();
    await setActive.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      isActive: false,
    });

    await expect(
      setAccepts.execute({
        ...command,
        context: admin1,
        id: sede1.id,
        acceptsApplications: true,
      }),
    ).rejects.toMatchObject({ code: 'CONGREGATION_INACTIVE' });
    await expect(
      setAccepts.execute({
        ...command,
        context: admin1,
        id: sede1.id,
        acceptsApplications: true,
      }),
    ).rejects.toBeInstanceOf(ConflictDomainException);
  });

  it('opens and closes applications and audits the change', async () => {
    const { setAccepts, sede1, audit } = build();

    const closed = await setAccepts.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      acceptsApplications: false,
    });

    expect(closed.acceptsApplications).toBe(false);
    expect(audit.entries[0]).toMatchObject({
      action: 'UPDATE',
      changes: { acceptsApplications: { from: true, to: false } },
    });
  });

  it('answers 404 when the sede belongs to another denomination', async () => {
    const { setAccepts, sede2 } = build();

    await expect(
      setAccepts.execute({
        ...command,
        context: admin1,
        id: sede2.id,
        acceptsApplications: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});

describe('legal entities', () => {
  it('lists only the entities of the denomination', async () => {
    const { listLegalEntities, entity1, entity2 } = build();

    expect(
      (await listLegalEntities.execute(admin1)).map((row) => row.id),
    ).toEqual([entity1.id]);
    expect(
      (await listLegalEntities.execute(admin2)).map((row) => row.id),
    ).toEqual([entity2.id]);
  });

  it('stores the NIT in canonical form, resolves the municipality and audits only the name and state', async () => {
    const { createLegalEntity, audit } = build();

    const created = await createLegalEntity.execute({
      ...command,
      context: admin1,
      input: entity({ taxId: '902111222-3', email: 'Info@Example.com' }),
    });

    expect(created).toMatchObject({
      taxId: '902.111.222-3',
      municipalityName: 'Bogotá, D.C.',
      email: 'info@example.com',
      isActive: true,
    });
    expect(Object.keys(audit.entries[0].changes ?? {}).sort()).toEqual([
      'isActive',
      'legalName',
    ]);
    expect(JSON.stringify(audit.entries[0].changes)).not.toContain('902');
  });

  it('rejects an invalid NIT and a NIT that already exists in any denomination', async () => {
    const { createLegalEntity, entity2 } = build();

    await expect(
      createLegalEntity.execute({
        ...command,
        context: admin1,
        input: entity({ taxId: '12345' }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TAX_ID' });
    await expect(
      createLegalEntity.execute({
        ...command,
        context: admin1,
        input: entity({ taxId: entity2.taxId.replaceAll('.', '') }),
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TAX_ID' });
  });

  it('may keep its own NIT when it is edited', async () => {
    const { updateLegalEntity, entity1 } = build();

    const updated = await updateLegalEntity.execute({
      ...command,
      context: admin1,
      id: entity1.id,
      input: entity({ taxId: entity1.taxId, legalName: 'Nombre nuevo' }),
    });

    expect(updated.legalName).toBe('Nombre nuevo');
  });

  it('answers 404 when updating or toggling an entity of another denomination', async () => {
    const { updateLegalEntity, setLegalEntityActive, entity2 } = build();

    await expect(
      updateLegalEntity.execute({
        ...command,
        context: admin1,
        id: entity2.id,
        input: entity(),
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      setLegalEntityActive.execute({
        ...command,
        context: admin1,
        id: entity2.id,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });

  it('cannot be deactivated while it has active sedes', async () => {
    const { setLegalEntityActive, entity1, sede1, setActive } = build();

    await expect(
      setLegalEntityActive.execute({
        ...command,
        context: admin1,
        id: entity1.id,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_ENTITY_IN_USE' });

    await setActive.execute({
      ...command,
      context: admin1,
      id: sede1.id,
      isActive: false,
    });
    await expect(
      setLegalEntityActive.execute({
        ...command,
        context: admin1,
        id: entity1.id,
        isActive: false,
      }),
    ).resolves.toMatchObject({ isActive: false });
  });
});

describe('districts', () => {
  it('lists only its own districts in natural numeric order', async () => {
    const { listDistricts, world } = build();
    world.addDistrict(1, { number: '10' });
    world.addDistrict(1, { number: '1' });

    const rows = await listDistricts.execute(admin1);

    expect(rows.map((row) => row.number)).toEqual(['1', '2', '10']);
    expect(rows.every((row) => row.denominationId === 1)).toBe(true);
  });

  it('rejects a duplicate number inside the denomination only', async () => {
    const { createDistrict } = build();

    await expect(
      createDistrict.execute({
        ...command,
        context: admin1,
        input: { number: ' 2 ', name: null },
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_DISTRICT_NUMBER' });
    await expect(
      createDistrict.execute({
        ...command,
        context: admin2,
        input: { number: '2', name: 'Costa' },
      }),
    ).resolves.toMatchObject({ number: '2', name: 'Costa' });
  });

  it('updates, audits the difference and hides districts of other denominations', async () => {
    const { updateDistrict, district1, district2, audit } = build();

    await updateDistrict.execute({
      ...command,
      context: admin1,
      id: district1.id,
      input: { number: '2', name: 'Caribe' },
    });

    expect(audit.entries[0]).toMatchObject({
      entity: 'District',
      changes: { name: { from: null, to: 'Caribe' } },
    });
    await expect(
      updateDistrict.execute({
        ...command,
        context: admin1,
        id: district2.id,
        input: { number: '9', name: null },
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});

describe('form options', () => {
  it('offers only the legal entities and districts of the denomination', async () => {
    const { formOptions, entity1, district1 } = build();

    const options = await formOptions.execute(admin1);

    expect(options.legalEntities.map((row) => row.id)).toEqual([entity1.id]);
    expect(options.districts).toEqual([
      { id: district1.id, label: 'Distrito 2', isActive: true },
    ]);
  });
});
