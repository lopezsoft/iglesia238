import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import {
  DemoDenominationsRepository,
  PRIVACY_POLICY_DRAFT_VERSION,
} from './demo-denominations.repository';
import { DenominationsDemoStore } from './denominations-demo-store';
import { clampPage } from './denominations.models';
import { DenominationsRepository } from './denominations.repository';

const PLATFORM_ADMIN = 'laura.gomez@iglesia238.example';
const DENOMINATION_ADMIN = 'andres.molina@montedesion.example';

async function setup(
  email: string,
): Promise<{ repository: DenominationsRepository; db: DemoDatabase }> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: DenominationsRepository, useClass: DemoDenominationsRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_PASSWORD));
  return { repository: TestBed.inject(DenominationsRepository), db: TestBed.inject(DemoDatabase) };
}

async function domainError(source: Promise<unknown>): Promise<DomainError> {
  const error = await source.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

const ALL = { search: '', status: 'all', page: 1, pageSize: 10 } as const;

describe('DemoDenominationsRepository', () => {
  it('lists every denomination with structural counts only', async () => {
    const { repository } = await setup(PLATFORM_ADMIN);

    const page = await firstValueFrom(repository.list(ALL));

    expect(page.total).toBe(3);
    const monteDeSion = page.items.find((row) => row.id === 1)!;
    expect(monteDeSion.legalEntityCount).toBe(2);
    expect(monteDeSion.congregationCount).toBe(3);
    expect(Object.keys(monteDeSion).sort()).toEqual(
      ['congregationCount', 'createdAt', 'id', 'isActive', 'legalEntityCount', 'name'].sort(),
    );
  });

  it('filters by accent-insensitive text and by status', async () => {
    const { repository } = await setup(PLATFORM_ADMIN);

    const byText = await firstValueFrom(repository.list({ ...ALL, search: 'evangelica' }));
    expect(byText.items.map((row) => row.id)).toEqual([3]);

    const inactive = await firstValueFrom(repository.list({ ...ALL, status: 'inactive' }));
    expect(inactive.items.map((row) => row.id)).toEqual([3]);
  });

  it('creates a denomination with its privacy policy draft and an audit entry', async () => {
    const { repository, db } = await setup(PLATFORM_ADMIN);

    const created = await firstValueFrom(repository.create({ name: '  Iglesia Nueva Esperanza ' }));

    expect(created.name).toBe('Iglesia Nueva Esperanza');
    expect(created.isActive).toBe(true);
    const drafts = TestBed.inject(DenominationsDemoStore).privacyPolicyDrafts.filter(
      (draft) => draft.denominationId === created.id,
    );
    expect(drafts.map((draft) => draft.version)).toEqual([PRIVACY_POLICY_DRAFT_VERSION]);
    // The draft is not a published policy: applicants cannot consent to it.
    expect(db.privacyPolicies.some((policy) => policy.denominationId === created.id)).toBe(false);
    const audit = db.auditLogs.at(-1)!;
    expect(audit).toMatchObject({
      entity: 'Denomination',
      entityId: String(created.id),
      action: 'CREATE',
      userId: 1,
    });
  });

  it('rejects a duplicate name ignoring case and accents', async () => {
    const { repository } = await setup(PLATFORM_ADMIN);

    const error = await domainError(
      firstValueFrom(repository.create({ name: 'iglesia evangelica CAMINO de fe' })),
    );

    expect(error.code).toBe('DUPLICATE_NAME');
    expect(error.message).toBe('Ya existe una denominación con ese nombre');
  });

  it('renames keeping uniqueness against the other denominations only', async () => {
    const { repository } = await setup(PLATFORM_ADMIN);

    const same = await firstValueFrom(
      repository.rename(1, { name: 'Iglesia Cristiana Monte de Sión' }),
    );
    expect(same.name).toBe('Iglesia Cristiana Monte de Sión');

    const error = await domainError(
      firstValueFrom(repository.rename(1, { name: 'Comunidad Cristiana Vida Nueva' })),
    );
    expect(error.code).toBe('DUPLICATE_NAME');
  });

  it('deactivates and activates with audit entries free of personal data', async () => {
    const { repository, db } = await setup(PLATFORM_ADMIN);

    const deactivated = await firstValueFrom(repository.setActive(2, false));
    expect(deactivated.isActive).toBe(false);
    expect(db.auditLogs.at(-1)).toMatchObject({
      action: 'DEACTIVATE',
      changes: { isActive: { from: true, to: false } },
    });

    const activated = await firstValueFrom(repository.setActive(2, true));
    expect(activated.isActive).toBe(true);
    expect(db.auditLogs.at(-1)?.action).toBe('ACTIVATE');
  });

  it('clamps the page when a status change empties the last one', () => {
    expect(clampPage(2, 10, 10)).toBe(1);
    expect(clampPage(2, 11, 10)).toBe(2);
    expect(clampPage(3, 0, 10)).toBe(1);
  });

  it('rejects every operation for a user without denominations.manage', async () => {
    const { repository, db } = await setup(DENOMINATION_ADMIN);
    const before = db.denominations.length;

    expect((await domainError(firstValueFrom(repository.list(ALL)))).code).toBe('FORBIDDEN');
    expect((await domainError(firstValueFrom(repository.create({ name: 'Otra' })))).code).toBe(
      'FORBIDDEN',
    );
    expect((await domainError(firstValueFrom(repository.setActive(2, false)))).code).toBe(
      'FORBIDDEN',
    );
    expect(db.denominations.length).toBe(before);
    expect(db.denominations.find((row) => row.id === 2)?.isActive).toBe(true);
  });
});
