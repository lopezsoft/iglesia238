import {
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from '../../../../test/support/foundation-fakes.js';
import {
  COLOMBIA,
  EMPTY_COUNTRY,
  INACTIVE_COUNTRY,
  InMemoryGeoRepository,
  InMemoryLegalEntityRepository,
  InMemoryOrganization,
  InMemoryPlatformLegalEntityReader,
  OTHER_COUNTRY,
} from '../../../../test/support/in-memory-organization.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  ForbiddenDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  LegalEntityInputValidator,
  type LegalEntityInput,
} from './legal-entities.use-cases.js';
import {
  CreatePlatformLegalEntityUseCase,
  ListPlatformLegalEntitiesUseCase,
  SetPlatformLegalEntityActiveUseCase,
  UpdatePlatformLegalEntityUseCase,
} from './platform-legal-entities.use-cases.js';

const platform = buildTenantContext({
  kind: 'PLATFORM',
  permissions: ['denominations.manage'],
});
const denominationAdmin = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 1,
  permissions: ['congregations.manage'],
});
const command = { ipAddress: '10.1.1.1' };

function build() {
  const world = new InMemoryOrganization();
  const legalEntities = new InMemoryLegalEntityRepository(world);
  const reader = new InMemoryPlatformLegalEntityReader(world);
  const geo = new InMemoryGeoRepository(world);
  const validator = new LegalEntityInputValidator(legalEntities, geo);
  const audit = new RecordingAuditRecorder();
  const transactions = new ImmediateTransactionRunner();

  const entity1 = world.addLegalEntity(1, { legalName: 'Corporación Uno' });
  const entity2 = world.addLegalEntity(2, { legalName: 'Corporación Dos' });
  const sede1 = world.addCongregation(1, entity1.id, { name: 'Sede Central' });

  return {
    world,
    audit,
    entity1,
    entity2,
    sede1,
    list: new ListPlatformLegalEntitiesUseCase(reader),
    create: new CreatePlatformLegalEntityUseCase(
      legalEntities,
      reader,
      validator,
      transactions,
      audit,
    ),
    update: new UpdatePlatformLegalEntityUseCase(
      legalEntities,
      reader,
      validator,
      transactions,
      audit,
    ),
    setActive: new SetPlatformLegalEntityActiveUseCase(
      legalEntities,
      reader,
      transactions,
      audit,
    ),
  };
}

function input(overrides: Partial<LegalEntityInput> = {}): LegalEntityInput {
  return {
    legalName: 'Corporación Educativa',
    tradeName: null,
    taxId: '902111222-3',
    legalRepresentative: 'Representante',
    countryId: COLOMBIA.id,
    municipalityCode: '11001',
    email: null,
    phone: null,
    address: null,
    ...overrides,
  };
}

describe('ListPlatformLegalEntitiesUseCase', () => {
  it('lists the entities of every denomination with its name and congregation count, or of one', async () => {
    const { list, entity1, entity2 } = build();

    const all = await list.execute(platform, null);
    expect(all.map((row) => row.id)).toEqual([entity2.id, entity1.id]);
    expect(all.find((row) => row.id === entity1.id)).toMatchObject({
      denominationName: 'Denominación Uno',
      congregationCount: 1,
    });

    const one = await list.execute(platform, 2);
    expect(one.map((row) => row.id)).toEqual([entity2.id]);
  });

  it('is closed to a session that is not at platform scope', async () => {
    const { list } = build();

    await expect(list.execute(denominationAdmin, null)).rejects.toBeInstanceOf(
      ForbiddenDomainException,
    );
  });
});

describe('CreatePlatformLegalEntityUseCase', () => {
  it('creates the entity in the denomination of the body, without any denomination user', async () => {
    const { create, world } = build();

    const created = await create.execute({
      ...command,
      context: platform,
      denominationId: 2,
      input: input({ email: 'Info@Example.com' }),
    });

    expect(created).toMatchObject({
      denominationId: 2,
      denominationName: 'Denominación Dos',
      countryId: COLOMBIA.id,
      countryName: 'Colombia',
      taxId: '902.111.222-3',
      email: 'info@example.com',
      isActive: true,
      congregationCount: 0,
    });
    expect(
      world.legalEntities.find((row) => row.id === created.id)?.denominationId,
    ).toBe(2);
  });

  it('audits as the platform user with the target denomination and without the NIT', async () => {
    const { create, audit } = build();

    await create.execute({
      ...command,
      context: platform,
      denominationId: 2,
      input: input(),
    });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'CREATE',
      entity: 'LegalEntity',
      actor: { userId: 7, denominationId: null, congregationId: null },
      denominationId: 2,
      ipAddress: '10.1.1.1',
    });
    expect(Object.keys(audit.entries[0].changes ?? {}).sort()).toEqual([
      'countryId',
      'isActive',
      'legalName',
    ]);
    expect(JSON.stringify(audit.entries)).not.toContain('902');
  });

  it('answers 409 DUPLICATE_TAX_ID for a NIT already used in any denomination', async () => {
    const { create, entity1 } = build();

    await expect(
      create.execute({
        ...command,
        context: platform,
        denominationId: 2,
        input: input({ taxId: entity1.taxId.replaceAll('.', '') }),
      }),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_TAX_ID',
      message: 'Ya existe una razón social registrada con ese NIT.',
    });
  });

  it('answers 404 for an unknown denomination and 409 for an inactive one', async () => {
    const { create, world } = build();

    await expect(
      create.execute({
        ...command,
        context: platform,
        denominationId: 99,
        input: input(),
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      create.execute({
        ...command,
        context: platform,
        denominationId: 3,
        input: input(),
      }),
    ).rejects.toMatchObject({ code: 'DENOMINATION_INACTIVE' });
    expect(world.legalEntities).toHaveLength(2);
  });

  it('answers 404 COUNTRY_NOT_FOUND and 400 for a municipality of another country', async () => {
    const { create, world } = build();

    await expect(
      create.execute({
        ...command,
        context: platform,
        denominationId: 2,
        input: input({ countryId: 9999 }),
      }),
    ).rejects.toMatchObject({ code: 'COUNTRY_NOT_FOUND' });
    await expect(
      create.execute({
        ...command,
        context: platform,
        denominationId: 2,
        input: input({
          countryId: OTHER_COUNTRY.id,
          municipalityCode: '11001',
        }),
      }),
    ).rejects.toMatchObject({
      code: 'MUNICIPALITY_COUNTRY_MISMATCH',
      message: 'El municipio no pertenece al país de la razón social.',
    });
    expect(world.legalEntities).toHaveLength(2);
  });

  it('creates an entity without municipality in a country that has none loaded', async () => {
    const { create } = build();

    await expect(
      create.execute({
        ...command,
        context: platform,
        denominationId: 2,
        input: input({ countryId: EMPTY_COUNTRY.id, municipalityCode: null }),
      }),
    ).resolves.toMatchObject({
      countryId: EMPTY_COUNTRY.id,
      countryName: EMPTY_COUNTRY.name,
      municipalityCode: null,
    });
  });

  it('refuses a session that is not at platform scope', async () => {
    const { create } = build();

    await expect(
      create.execute({
        ...command,
        context: denominationAdmin,
        denominationId: 1,
        input: input(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});

describe('UpdatePlatformLegalEntityUseCase', () => {
  it('changes only the fields that are sent and keeps the denomination', async () => {
    const { update, entity1 } = build();

    const updated = await update.execute({
      ...command,
      context: platform,
      id: entity1.id,
      patch: { legalName: 'Nombre nuevo', tradeName: 'Marca' },
    });

    expect(updated).toMatchObject({
      legalName: 'Nombre nuevo',
      tradeName: 'Marca',
      taxId: entity1.taxId,
      legalRepresentative: entity1.legalRepresentative,
      municipalityCode: entity1.municipalityCode,
      denominationId: 1,
    });
  });

  it('can clear an optional field with null and move to another municipality', async () => {
    const { update, entity1 } = build();

    const updated = await update.execute({
      ...command,
      context: platform,
      id: entity1.id,
      patch: { tradeName: null, municipalityCode: '11001' },
    });

    expect(updated).toMatchObject({
      tradeName: null,
      municipalityName: 'Bogotá, D.C.',
    });
  });

  it('can remove the municipality with null', async () => {
    const { update, entity1 } = build();

    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity1.id,
        patch: { municipalityCode: null },
      }),
    ).resolves.toMatchObject({
      countryId: COLOMBIA.id,
      municipalityCode: null,
    });
  });

  it('changes the country only together with a municipality of the new country or null', async () => {
    const { update, entity2, audit } = build();

    // Keeping the Colombian municipality would leave it in the wrong country.
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity2.id,
        patch: { countryId: OTHER_COUNTRY.id },
      }),
    ).rejects.toMatchObject({ code: 'MUNICIPALITY_COUNTRY_MISMATCH' });
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity2.id,
        patch: { countryId: OTHER_COUNTRY.id, municipalityCode: '11001' },
      }),
    ).rejects.toMatchObject({ code: 'MUNICIPALITY_COUNTRY_MISMATCH' });
    expect(audit.entries).toHaveLength(0);

    // 13001 also exists in the other country: it resolves to that country's municipality.
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity2.id,
        patch: { countryId: OTHER_COUNTRY.id, municipalityCode: '13001' },
      }),
    ).resolves.toMatchObject({
      countryId: OTHER_COUNTRY.id,
      countryName: OTHER_COUNTRY.name,
      municipalityName: 'Municipio extranjero',
    });
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity2.id,
        patch: { countryId: EMPTY_COUNTRY.id, municipalityCode: null },
      }),
    ).resolves.toMatchObject({
      countryId: EMPTY_COUNTRY.id,
      municipalityCode: null,
    });
  });

  it('answers 409 LEGAL_ENTITY_HAS_CONGREGATIONS when the entity with sedes changes country, and 404 for an unknown one', async () => {
    const { update, entity1 } = build();

    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity1.id,
        patch: { countryId: OTHER_COUNTRY.id, municipalityCode: null },
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_ENTITY_HAS_CONGREGATIONS' });
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity1.id,
        patch: { countryId: 9999 },
      }),
    ).rejects.toMatchObject({ code: 'COUNTRY_NOT_FOUND' });
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity1.id,
        patch: { countryId: INACTIVE_COUNTRY.id, municipalityCode: null },
      }),
    ).rejects.toMatchObject({
      code: 'COUNTRY_INACTIVE',
      message: 'El país no está activo en el sistema.',
    });
    // The same country is not a change, even with sedes.
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity1.id,
        patch: { countryId: COLOMBIA.id, legalName: 'Mismo país' },
      }),
    ).resolves.toMatchObject({ legalName: 'Mismo país' });
  });

  it('answers 409 when the new NIT belongs to another entity, and may keep its own', async () => {
    const { update, entity1, entity2 } = build();

    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity1.id,
        patch: { taxId: entity2.taxId },
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TAX_ID' });
    await expect(
      update.execute({
        ...command,
        context: platform,
        id: entity1.id,
        patch: { taxId: entity1.taxId },
      }),
    ).resolves.toMatchObject({ id: entity1.id });
  });

  it('audits the change as the platform user and writes nothing when nothing changed', async () => {
    const { update, audit, entity1 } = build();

    await update.execute({
      ...command,
      context: platform,
      id: entity1.id,
      patch: { legalName: 'Otro nombre' },
    });
    await update.execute({
      ...command,
      context: platform,
      id: entity1.id,
      patch: { legalName: 'Otro nombre' },
    });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'UPDATE',
      actor: { userId: 7, denominationId: null },
      denominationId: 1,
    });
  });

  it('answers 404 for an unknown id and refuses a non-platform session', async () => {
    const { update, entity1 } = build();

    await expect(
      update.execute({
        ...command,
        context: platform,
        id: 999,
        patch: { legalName: 'x' },
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      update.execute({
        ...command,
        context: denominationAdmin,
        id: entity1.id,
        patch: { legalName: 'x' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});

describe('SetPlatformLegalEntityActiveUseCase', () => {
  it('cannot deactivate an entity with active sedes, and audits the change when it can', async () => {
    const { setActive, audit, entity1, entity2 } = build();

    await expect(
      setActive.execute({
        ...command,
        context: platform,
        id: entity1.id,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_ENTITY_IN_USE' });

    const off = await setActive.execute({
      ...command,
      context: platform,
      id: entity2.id,
      isActive: false,
    });
    expect(off.isActive).toBe(false);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'DEACTIVATE',
      denominationId: 2,
      changes: { isActive: { from: true, to: false } },
    });

    const on = await setActive.execute({
      ...command,
      context: platform,
      id: entity2.id,
      isActive: true,
    });
    expect(on.isActive).toBe(true);
  });

  it('is a no-op when the state does not change', async () => {
    const { setActive, audit, entity1 } = build();

    await setActive.execute({
      ...command,
      context: platform,
      id: entity1.id,
      isActive: true,
    });

    expect(audit.entries).toHaveLength(0);
  });
});
