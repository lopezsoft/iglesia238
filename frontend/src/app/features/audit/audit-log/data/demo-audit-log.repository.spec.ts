import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { rangeLength } from '../components/audit-filters.component';
import { AuditQuery, MAX_RANGE_DAYS, auditActionLabel, auditActionTone, maskIpAddress } from './audit-log.models';
import { AuditLogRepository } from './audit-log.repository';
import { DemoAuditLogRepository } from './demo-audit-log.repository';

const ALL: AuditQuery = { from: null, to: null, userId: null, action: null, entity: null, page: 1, pageSize: 20 };

interface Setup {
  readonly repository: AuditLogRepository;
  readonly auth: AuthService;
  readonly db: DemoDatabase;
}

async function signIn(email: string): Promise<Setup> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: AuditLogRepository, useClass: DemoAuditLogRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  return { repository: TestBed.inject(AuditLogRepository), auth, db: TestBed.inject(DemoDatabase) };
}

async function failureCode(request: Observable<unknown>): Promise<string> {
  try {
    await firstValueFrom(request);
  } catch (error) {
    return error instanceof DomainError ? error.code : 'UNEXPECTED';
  }
  return 'NO_ERROR';
}

describe('maskIpAddress', () => {
  it('keeps only the first two octets of an IPv4 address', () => {
    expect(maskIpAddress('181.52.10.24')).toBe('181.52.•••.•••');
  });

  it('keeps the first two groups of an IPv6 address and hides anything else', () => {
    expect(maskIpAddress('2800:e2:1a00:52::7')).toBe('2800:e2:••••');
    expect(maskIpAddress('localhost')).toBe('•••');
    expect(maskIpAddress(null)).toBe('—');
  });
});

describe('auditActionLabel', () => {
  it('translates known actions and shows unknown codes raw', () => {
    expect(auditActionLabel('ROLE_REVOKED')).toBe('Rol revocado');
    expect(auditActionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('translates the reactivation written by denominations and organization', () => {
    expect(auditActionLabel('ACTIVATE')).toBe('Activación');
    expect(auditActionTone('ACTIVATE')).toBe('success');
  });
});

describe('rangeLength validator', () => {
  const range = (from: string, to: string) => new FormGroup({ from: new FormControl(from), to: new FormControl(to) });

  it(`accepts up to ${MAX_RANGE_DAYS} calendar days, both ends included`, () => {
    expect(rangeLength(range('2026-01-01', '2026-03-31'))).toBeNull();
    expect(rangeLength(range('', '2026-10-31'))).toBeNull();
  });

  it('rejects a longer range before it reaches the API', () => {
    expect(rangeLength(range('2026-01-01', '2026-04-01'))).toEqual({ rangeLength: { max: MAX_RANGE_DAYS, actual: 91 } });
    expect(rangeLength(range('2026-01-01', '2026-10-31'))).not.toBeNull();
  });
});

describe('DemoAuditLogRepository', () => {
  it('shows the platform admin every entry, newest first, with masked IPs', async () => {
    const { repository, db } = await signIn('laura.gomez@iglesia238.example');

    const page = await firstValueFrom(repository.list(ALL));

    expect(page.total).toBe(db.auditLogs.length);
    const dates = page.items.map((item) => item.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(page.items.every((item) => /^(\d+\.\d+\.•••\.•••|—)$/.test(item.ipAddress))).toBe(true);
  });

  it('shows a denomination admin only their denomination', async () => {
    const { repository, db } = await signIn('andres.molina@montedesion.example');

    const page = await firstValueFrom(repository.list({ ...ALL, pageSize: 100 }));

    const expected = db.auditLogs.filter((entry) => entry.denominationId === 1).length;
    expect(page.total).toBe(expected);
    expect(page.items.some((item) => item.entity === 'Congregation' && item.entityId === '4')).toBe(false);
  });

  it('narrows to the active sede when the admin acts on one', async () => {
    const { repository, auth } = await signIn('andres.molina@montedesion.example');
    auth.selectScope(auth.user()!.selectableScopes.find((scope) => scope.congregationId === 1)!);

    const page = await firstValueFrom(repository.list({ ...ALL, pageSize: 100 }));

    expect(page.items.every((item) => item.scopeLabel === 'Sede Central')).toBe(true);
  });

  it('isolates the admin of another denomination', async () => {
    const { repository } = await signIn('ricardo.leon@vidanueva.example');

    const page = await firstValueFrom(repository.list(ALL));

    expect(page.items.map((item) => item.entityId)).toEqual(['4']);
  });

  it('rejects a role without audit-logs.read', async () => {
    const { repository } = await signIn('marta.castillo@montedesion.example');

    expect(await failureCode(repository.list(ALL))).toBe('FORBIDDEN');
  });

  it('filters by user, action, entity and date range', async () => {
    const { repository } = await signIn('laura.gomez@iglesia238.example');

    const byUser = await firstValueFrom(repository.list({ ...ALL, userId: 5 }));
    const byAction = await firstValueFrom(repository.list({ ...ALL, action: 'LOGIN' }));
    const byEntity = await firstValueFrom(repository.list({ ...ALL, entity: 'MembershipApplication' }));
    const byRange = await firstValueFrom(repository.list({ ...ALL, from: '2026-10-28', to: '2026-10-30' }));

    expect(byUser.items.map((item) => item.action).sort()).toEqual(['CONTRIBUTION_VOIDED', 'PERIOD_CLOSED']);
    expect(byAction.items.every((item) => item.action === 'LOGIN')).toBe(true);
    expect(byAction.total).toBe(2);
    expect(byEntity.total).toBe(2);
    expect(byRange.items.map((item) => item.action).sort()).toEqual(['CERTIFICATE_ISSUED', 'CONTRIBUTION_VOIDED']);
    expect(byRange.summary.contributionVoids).toBe(1);
  });

  it('paginates with 20 rows per page', async () => {
    const { repository, db } = await signIn('laura.gomez@iglesia238.example');
    for (let i = 0; i < 25; i++) {
      db.audit({ userId: 1, denominationId: 1, congregationId: null, entity: 'User', entityId: '1', action: 'LOGIN', changes: null });
    }

    const first = await firstValueFrom(repository.list(ALL));
    const second = await firstValueFrom(repository.list({ ...ALL, page: 2 }));

    expect(first.items.length).toBe(20);
    expect(second.items.length).toBe(first.total - 20);
  });

  it('validates the date range', async () => {
    const { repository } = await signIn('laura.gomez@iglesia238.example');

    const reversed = await failureCode(repository.list({ ...ALL, from: '2026-11-02', to: '2026-10-01' }));
    const tooLong = await failureCode(repository.list({ ...ALL, from: '2026-01-01', to: '2026-11-02' }));

    expect([reversed, tooLong]).toEqual(['INVALID_RANGE', 'RANGE_TOO_LONG']);
  });

  it('formats the field diff without personal data', async () => {
    const { repository } = await signIn('laura.gomez@iglesia238.example');

    const page = await firstValueFrom(repository.list({ ...ALL, entity: 'Denomination' }));

    expect(page.items[0].changes).toEqual([{ field: 'isActive', from: '—', to: 'Sí' }]);
  });

  it('lists filter options from the visible entries only', async () => {
    const { repository } = await signIn('ricardo.leon@vidanueva.example');

    const options = await firstValueFrom(repository.filterOptions());

    expect(options.users.map((user) => user.id)).toEqual([8]);
    expect(options.actions).toEqual(['UPDATE']);
  });
});
