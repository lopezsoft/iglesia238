import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { DemoOrganizationRepository } from './demo-organization.repository';
import { CongregationInput, LegalEntityInput } from './organization.models';
import { OrganizationRepository } from './organization.repository';

const ADMIN_DENOMINATION_1 = 'andres.molina@montedesion.example';
const ADMIN_DENOMINATION_2 = 'ricardo.leon@vidanueva.example';
const PASTOR = 'daniel.herrera@montedesion.example';

interface Context {
  readonly repository: OrganizationRepository;
  readonly db: DemoDatabase;
  readonly auth: AuthService;
}

async function setup(email: string): Promise<Context> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: OrganizationRepository, useClass: DemoOrganizationRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  return {
    repository: TestBed.inject(OrganizationRepository),
    db: TestBed.inject(DemoDatabase),
    auth,
  };
}

async function domainError(source: Promise<unknown>): Promise<DomainError> {
  const error = await source.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

function sede(overrides: Partial<CongregationInput> = {}): CongregationInput {
  return {
    name: 'Sede Chía',
    legalEntityId: 1,
    districtId: 2,
    municipalityCode: '25175',
    neighborhood: 'Centro',
    address: 'Calle 10 # 5-20',
    phone: null,
    email: 'chia@montedesion.example',
    acceptsApplications: true,
    ...overrides,
  };
}

function legalEntity(overrides: Partial<LegalEntityInput> = {}): LegalEntityInput {
  return {
    legalName: 'Corporación Educativa Monte de Sion',
    tradeName: null,
    taxId: '902.111.222-3',
    legalRepresentative: 'Representante de prueba',
    municipalityCode: '11001',
    email: null,
    phone: null,
    address: null,
    ...overrides,
  };
}

describe('DemoOrganizationRepository', () => {
  describe('tenant isolation', () => {
    it('shows the admin of denomination 1 only the structure of denomination 1', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const [sedes, entities, districts, overview] = await Promise.all([
        firstValueFrom(repository.listCongregations()),
        firstValueFrom(repository.listLegalEntities()),
        firstValueFrom(repository.listDistricts()),
        firstValueFrom(repository.overview()),
      ]);

      expect(sedes.map((row) => row.id).sort()).toEqual([1, 2, 3]);
      expect(entities.every((row) => row.denominationId === 1)).toBe(true);
      expect(districts.map((row) => row.id).sort()).toEqual([1, 2]);
      expect(overview).toMatchObject({
        denominationName: 'Iglesia Cristiana Monte de Sion',
        legalEntities: 2,
        districts: 2,
      });
    });

    it('keeps acting on the whole denomination when a sede is selected', async () => {
      const { repository, auth } = await setup(ADMIN_DENOMINATION_1);
      auth.selectScope(auth.user()!.selectableScopes.find((scope) => scope.congregationId === 2)!);

      const sedes = await firstValueFrom(repository.listCongregations());

      expect(sedes.map((row) => row.id).sort()).toEqual([1, 2, 3]);
    });

    it('never returns rows of denomination 1 to the admin of denomination 2', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_2);

      const sedes = await firstValueFrom(repository.listCongregations());
      const entities = await firstValueFrom(repository.listLegalEntities());

      expect(sedes.map((row) => row.id).sort()).toEqual([4, 5]);
      expect(entities.map((row) => row.id)).toEqual([3]);
    });

    it('answers writes on rows of another denomination as not found', async () => {
      const { repository, db } = await setup(ADMIN_DENOMINATION_2);

      const error = await domainError(firstValueFrom(repository.setCongregationActive(1, false)));

      expect(error.code).toBe('NOT_FOUND');
      expect(db.congregation(1)?.isActive).toBe(true);
    });

    it('rejects a legal entity or a district of another denomination', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const foreignEntity = await domainError(
        firstValueFrom(repository.createCongregation(sede({ legalEntityId: 3 }))),
      );
      const foreignDistrict = await domainError(
        firstValueFrom(repository.createCongregation(sede({ districtId: 3 }))),
      );

      expect(foreignEntity.code).toBe('CROSS_TENANT');
      expect(foreignDistrict.code).toBe('CROSS_TENANT');
    });
  });

  describe('permissions', () => {
    it('rejects reads and writes for a role without congregations.manage', async () => {
      const { repository, db } = await setup(PASTOR);
      const before = db.congregations.length;

      expect((await domainError(firstValueFrom(repository.listCongregations()))).code).toBe(
        'FORBIDDEN',
      );
      expect((await domainError(firstValueFrom(repository.createCongregation(sede())))).code).toBe(
        'FORBIDDEN',
      );
      expect(
        (await domainError(firstValueFrom(repository.createDistrict({ number: '9', name: null }))))
          .code,
      ).toBe('FORBIDDEN');
      expect(db.congregations.length).toBe(before);
    });
  });

  describe('sedes', () => {
    it('creates a sede and audits it without personal data', async () => {
      const { repository, db } = await setup(ADMIN_DENOMINATION_1);

      const created = await firstValueFrom(repository.createCongregation(sede()));

      expect(created).toMatchObject({
        denominationId: 1,
        name: 'Sede Chía',
        legalEntityName: 'Iglesia Cristiana Monte de Sion',
        districtNumber: '2',
        isActive: true,
      });
      const audit = db.auditLogs.at(-1)!;
      expect(audit).toMatchObject({
        entity: 'Congregation',
        action: 'CREATE',
        denominationId: 1,
        userId: 2,
      });
      expect(JSON.stringify(audit.changes)).not.toContain('chia@montedesion.example');
      expect(JSON.stringify(audit.changes)).not.toContain('Calle 10');
    });

    it('requires a unique name inside the denomination, ignoring case and accents', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const error = await domainError(
        firstValueFrom(repository.createCongregation(sede({ name: 'sede  NORTE' }))),
      );
      expect(error.code).toBe('DUPLICATE_NAME');

      // Keeping its own name is not a duplicate, and names of another denomination do not count.
      const unchanged = await firstValueFrom(
        repository.updateCongregation(1, sede({ name: 'Sede Central' })),
      );
      expect(unchanged.name).toBe('Sede Central');
      const created = await firstValueFrom(
        repository.createCongregation(sede({ name: 'Vida Nueva Chapinero' })),
      );
      expect(created.denominationId).toBe(1);
    });

    it('closes applications when a sede is deactivated and refuses to reopen them while inactive', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const deactivated = await firstValueFrom(repository.setCongregationActive(2, false));
      expect(deactivated).toMatchObject({ isActive: false, acceptsApplications: false });

      const error = await domainError(firstValueFrom(repository.setAcceptsApplications(2, true)));
      expect(error.code).toBe('CONGREGATION_INACTIVE');
    });

    it('toggles the public applications flag with an audit entry', async () => {
      const { repository, db } = await setup(ADMIN_DENOMINATION_1);

      const updated = await firstValueFrom(repository.setAcceptsApplications(3, true));

      expect(updated.acceptsApplications).toBe(true);
      expect(db.auditLogs.at(-1)).toMatchObject({
        action: 'UPDATE',
        changes: { acceptsApplications: { from: false, to: true } },
      });
    });
  });

  describe('razones sociales', () => {
    it('creates a legal entity with the NIT in canonical format', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const created = await firstValueFrom(
        repository.createLegalEntity(legalEntity({ taxId: '902111222-3' })),
      );

      expect(created).toMatchObject({ denominationId: 1, taxId: '902.111.222-3', isActive: true });
    });

    it('validates the NIT format', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      for (const taxId of ['900123456', '90.0123.456-7', 'ABC-1', '900.123.456-77']) {
        const error = await domainError(
          firstValueFrom(repository.createLegalEntity(legalEntity({ taxId }))),
        );
        expect(error.code).toBe('INVALID_TAX_ID');
      }
    });

    it('keeps the NIT unique across all denominations', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      // 900.765.432-0 belongs to denomination 2.
      const error = await domainError(
        firstValueFrom(repository.createLegalEntity(legalEntity({ taxId: '900765432-0' }))),
      );

      expect(error.code).toBe('DUPLICATE_TAX_ID');
      expect(error.message).not.toContain('Vida Nueva');
    });

    it('does not deactivate a legal entity used by active sedes', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const error = await domainError(firstValueFrom(repository.setLegalEntityActive(1, false)));
      expect(error.code).toBe('LEGAL_ENTITY_IN_USE');

      const unused = await firstValueFrom(repository.setLegalEntityActive(2, false));
      expect(unused.isActive).toBe(false);
    });

    it('rejects an inactive legal entity for a new sede', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);
      await firstValueFrom(repository.setLegalEntityActive(2, false));

      const error = await domainError(
        firstValueFrom(repository.createCongregation(sede({ legalEntityId: 2 }))),
      );

      expect(error.code).toBe('LEGAL_ENTITY_INACTIVE');
    });
  });

  describe('distritos', () => {
    it('keeps the district number unique per denomination', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const error = await domainError(
        firstValueFrom(repository.createDistrict({ number: ' 2 ', name: 'Otro' })),
      );
      expect(error.code).toBe('DUPLICATE_DISTRICT_NUMBER');

      const created = await firstValueFrom(
        repository.createDistrict({ number: '3', name: 'Distrito Antioquia' }),
      );
      expect(created).toMatchObject({ denominationId: 1, number: '3', congregationNames: [] });
    });

    it('lists the sedes of each district', async () => {
      const { repository } = await setup(ADMIN_DENOMINATION_1);

      const districts = await firstValueFrom(repository.listDistricts());

      expect(districts.find((row) => row.id === 1)?.congregationNames).toEqual([
        'Sede Central',
        'Sede Norte',
      ]);
    });
  });
});
