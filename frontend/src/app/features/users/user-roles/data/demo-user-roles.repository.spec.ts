import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { DemoUserRolesRepository } from './demo-user-roles.repository';
import { activeAssignments, filterUsers, localIsoDate } from './user-roles.models';
import { UserRolesRepository } from './user-roles.repository';

const PLATFORM_ADMIN = 'laura.gomez@iglesia238.example';
const MONTE_DE_SION_ADMIN = 'andres.molina@montedesion.example';
const VIDA_NUEVA_ADMIN = 'ricardo.leon@vidanueva.example';
const TREASURER = 'jorge.ramirez@montedesion.example';

interface Setup {
  readonly repository: UserRolesRepository;
  readonly db: DemoDatabase;
}

async function signIn(email: string): Promise<Setup> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: UserRolesRepository, useClass: DemoUserRolesRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_PASSWORD));
  return { repository: TestBed.inject(UserRolesRepository), db: TestBed.inject(DemoDatabase) };
}

async function failureCode(request: Observable<unknown>): Promise<string> {
  try {
    await firstValueFrom(request);
  } catch (error) {
    return error instanceof DomainError ? error.code : 'UNEXPECTED';
  }
  return 'NO_ERROR';
}

describe('DemoUserRolesRepository', () => {
  describe('who is listed', () => {
    it('shows every user to the platform admin', async () => {
      const { repository, db } = await signIn(PLATFORM_ADMIN);

      const users = await firstValueFrom(repository.listUsers());

      expect(users.length).toBe(db.users.length);
    });

    it('shows a denomination admin only users with a role in their denomination', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);

      const users = await firstValueFrom(repository.listUsers());
      const ids = users.map((user) => user.id);

      expect(ids).not.toContain(1); // platform admin only
      expect(ids).not.toContain(8); // admin of Vida Nueva
      expect(ids).toEqual(expect.arrayContaining([2, 3, 4, 5, 6, 7, 9]));
      expect(users.flatMap((user) => user.assignments).every((a) => a.denominationId === 1)).toBe(true);
    });

    it('isolates the admin of another denomination', async () => {
      const { repository } = await signIn(VIDA_NUEVA_ADMIN);

      const users = await firstValueFrom(repository.listUsers());

      expect(users.map((user) => user.id)).toEqual([8]);
    });

    it('includes revoked assignments in the history and maps the status', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);

      const users = await firstValueFrom(repository.listUsers());
      const marta = users.find((user) => user.id === 4)!;
      const sofia = users.find((user) => user.id === 9)!;

      expect(marta.assignments.some((a) => a.revokedAt !== null)).toBe(true);
      expect(activeAssignments(marta).map((a) => a.role)).toEqual(['SECRETARY']);
      expect(sofia.status).toBe('INVITATION_PENDING');
      expect(users.find((user) => user.id === 2)!.isSelf).toBe(true);
    });

    it('rejects a role without users.manage', async () => {
      const { repository } = await signIn(TREASURER);

      expect(await failureCode(repository.listUsers())).toBe('FORBIDDEN');
    });

    it('filters by text and by active role', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);
      const users = await firstValueFrom(repository.listUsers());

      expect(filterUsers(users, { search: 'castillo', role: '' }).map((u) => u.id)).toEqual([4]);
      expect(filterUsers(users, { search: '', role: 'TREASURER' }).map((u) => u.id).sort()).toEqual([5, 6]);
    });
  });

  describe('grant context', () => {
    it('offers a denomination admin their denomination and its sedes, never PLATFORM_ADMIN', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);

      const context = await firstValueFrom(repository.grantContext());

      expect(context.isPlatformAdmin).toBe(false);
      expect(context.roles.map((option) => option.role)).toEqual(['DENOMINATION_ADMIN', 'PASTOR', 'SECRETARY', 'TREASURER']);
      const pastorScopes = context.roles.find((option) => option.role === 'PASTOR')!.scopes;
      expect(pastorScopes.every((scope) => scope.denominationId === 1 && scope.congregationId !== null)).toBe(true);
    });

    it('offers the platform admin every role', async () => {
      const { repository } = await signIn(PLATFORM_ADMIN);

      const context = await firstValueFrom(repository.grantContext());

      expect(context.isPlatformAdmin).toBe(true);
      expect(context.roles.map((option) => option.role)).toContain('PLATFORM_ADMIN');
    });
  });

  describe('granting', () => {
    it('grants a sede role, audits it without personal data and rejects a duplicate', async () => {
      const { repository, db } = await signIn(MONTE_DE_SION_ADMIN);
      const command = { userId: 4, role: 'PASTOR' as const, denominationId: 1, congregationId: 2 };

      const granted = await firstValueFrom(repository.grantRole(command));

      expect(granted.revokedAt).toBeNull();
      expect(granted.scopeLabel).toBe('Sede Norte');
      const entry = db.auditLogs.at(-1)!;
      expect(entry.action).toBe('ROLE_GRANTED');
      expect(entry.denominationId).toBe(1);
      expect(JSON.stringify(entry.changes)).not.toMatch(/marta|castillo|@/i);
      expect(await failureCode(repository.grantRole(command))).toBe('DUPLICATE_ROLE');
    });

    it('requires a sede for pastor, secretary and treasurer', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);

      const code = await failureCode(
        repository.grantRole({ userId: 5, role: 'SECRETARY', denominationId: 1, congregationId: null }),
      );

      expect(code).toBe('SCOPE_REQUIRED');
    });

    it('keeps a denomination admin inside their denomination', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);

      const otherSede = await failureCode(
        repository.grantRole({ userId: 5, role: 'PASTOR', denominationId: 2, congregationId: 4 }),
      );
      const otherDenomination = await failureCode(
        repository.grantRole({ userId: 5, role: 'DENOMINATION_ADMIN', denominationId: 2, congregationId: null }),
      );
      const platform = await failureCode(
        repository.grantRole({ userId: 5, role: 'PLATFORM_ADMIN', denominationId: null, congregationId: null }),
      );
      const foreignUser = await failureCode(
        repository.grantRole({ userId: 8, role: 'PASTOR', denominationId: 1, congregationId: 1 }),
      );

      expect([otherSede, otherDenomination, platform, foreignUser]).toEqual(['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN', 'NOT_FOUND']);
    });

    it('lets the platform admin grant DENOMINATION_ADMIN of any denomination', async () => {
      const { repository } = await signIn(PLATFORM_ADMIN);

      const granted = await firstValueFrom(
        repository.grantRole({ userId: 3, role: 'DENOMINATION_ADMIN', denominationId: 2, congregationId: null }),
      );

      expect(granted.scope).toBe('DENOMINATION');
      expect(granted.denominationId).toBe(2);
    });
  });

  describe('revoking', () => {
    it('sets revokedAt, keeps the row and allows granting it again as a new row', async () => {
      const { repository, db } = await signIn(MONTE_DE_SION_ADMIN);
      const rowsBefore = db.userRoles.length;

      const revoked = await firstValueFrom(repository.revokeRole(5));

      expect(revoked.revokedAt).not.toBeNull();
      expect(db.userRoles.length).toBe(rowsBefore);
      expect(db.auditLogs.at(-1)!.action).toBe('ROLE_REVOKED');
      expect(await failureCode(repository.revokeRole(5))).toBe('ALREADY_REVOKED');

      const again = await firstValueFrom(
        repository.grantRole({ userId: 5, role: 'TREASURER', denominationId: 1, congregationId: 1 }),
      );
      expect(again.id).not.toBe(5);
      expect(db.userRoles.length).toBe(rowsBefore + 1);
    });

    it('does not let an admin revoke their own admin role', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);

      expect(await failureCode(repository.revokeRole(2))).toBe('SELF_REVOKE');
    });

    it('hides assignments of another denomination', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);

      expect(await failureCode(repository.revokeRole(9))).toBe('NOT_FOUND');
    });
  });

  describe('inviting', () => {
    it('creates a user with a pending invitation and its first role', async () => {
      const { repository, db } = await signIn(MONTE_DE_SION_ADMIN);

      const user = await firstValueFrom(
        repository.inviteUser({
          displayName: '  Natalia   Cárdenas ',
          email: 'Natalia.Cardenas@Example.org',
          role: 'SECRETARY',
          denominationId: 1,
          congregationId: 2,
        }),
      );

      expect(user.status).toBe('INVITATION_PENDING');
      expect(user.displayName).toBe('Natalia Cárdenas');
      expect(user.email).toBe('natalia.cardenas@example.org');
      expect(activeAssignments(user).map((a) => a.scopeLabel)).toEqual(['Sede Norte']);
      const invited = db.auditLogs.find((entry) => entry.action === 'USER_INVITED')!;
      expect(JSON.stringify(invited.changes)).not.toMatch(/natalia|cardenas|@/i);
      const listed = await firstValueFrom(repository.listUsers());
      expect(listed.some((item) => item.id === user.id)).toBe(true);
    });

    it('rejects a duplicate or invalid email', async () => {
      const { repository } = await signIn(MONTE_DE_SION_ADMIN);
      const base = { displayName: 'Persona Nueva', role: 'PASTOR' as const, denominationId: 1, congregationId: 1 };

      const duplicate = await failureCode(repository.inviteUser({ ...base, email: 'MARTA.castillo@montedesion.example' }));
      const invalid = await failureCode(repository.inviteUser({ ...base, email: 'sin-arroba' }));

      expect([duplicate, invalid]).toEqual(['DUPLICATE_EMAIL', 'INVALID_EMAIL']);
    });

    it('links the role to an account of another tenant without disclosing it exists', async () => {
      const { repository, db } = await signIn(VIDA_NUEVA_ADMIN);
      const usersBefore = db.users.length;

      const user = await firstValueFrom(
        repository.inviteUser({
          displayName: 'Persona Nueva',
          email: 'marta.castillo@montedesion.example',
          role: 'PASTOR',
          denominationId: 2,
          congregationId: 4,
        }),
      );

      expect(user.id).toBe(4);
      expect(db.users.length).toBe(usersBefore);
      expect(user.assignments.every((a) => a.denominationId === 2)).toBe(true);
      expect(activeAssignments(user).map((a) => a.role)).toEqual(['PASTOR']);
      expect(db.auditLogs.at(-1)).toMatchObject({ action: 'ROLE_GRANTED', denominationId: 2 });
      const listed = await firstValueFrom(repository.listUsers());
      expect(listed.map((item) => item.id).sort()).toEqual([4, 8]);
    });
  });

  describe('localIsoDate', () => {
    afterEach(() => vi.useRealTimers());

    it('uses the local calendar day, not the UTC one', () => {
      expect(localIsoDate(new Date(2026, 10, 2, 23, 30))).toBe('2026-11-02');
    });

    it('records the local revocation day in the audit diff', async () => {
      const { repository, db } = await signIn(MONTE_DE_SION_ADMIN);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 2, 23, 30));

      await firstValueFrom(repository.revokeRole(5));

      expect(db.auditLogs.at(-1)!.changes).toMatchObject({ revokedAt: { from: null, to: '2026-11-02' } });
    });
  });
});
