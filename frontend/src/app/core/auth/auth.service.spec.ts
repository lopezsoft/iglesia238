import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DEMO_PASSWORD } from '../demo/demo-fixtures';
import { DomainError } from '../errors/domain-error';
import { AuthGateway } from './auth.gateway';
import { AuthService } from './auth.service';
import { DemoAuthGateway, MAX_FAILED_ATTEMPTS } from './demo-auth.gateway';

function setup(): AuthService {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [{ provide: AuthGateway, useClass: DemoAuthGateway }],
  });
  return TestBed.inject(AuthService);
}

describe('AuthService with the demo gateway', () => {
  it('grants the treasurer only the treasury permissions in their sede', async () => {
    const auth = setup();
    await firstValueFrom(auth.login('jorge.ramirez@montedesion.example', DEMO_PASSWORD));

    expect(auth.activeRoles()).toEqual(['TREASURER']);
    expect(auth.can('contributions.write')).toBe(true);
    expect(auth.can('members.read')).toBe(false);
    expect(auth.tenant()).toEqual({ denominationId: 1, congregationId: 1 });
  });

  it('switches permissions with the active scope for a user with roles in two sedes', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login('paola.ruiz@montedesion.example', DEMO_PASSWORD));

    const norte = user.selectableScopes.find((scope) => scope.congregationId === 2)!;
    const soacha = user.selectableScopes.find((scope) => scope.congregationId === 3)!;

    auth.selectScope(norte);
    expect(auth.activeRoles()).toEqual(['SECRETARY']);
    expect(auth.can('attendance.write')).toBe(true);
    expect(auth.can('contributions.write')).toBe(false);

    auth.selectScope(soacha);
    expect(auth.activeRoles()).toEqual(['TREASURER']);
    expect(auth.can('attendance.write')).toBe(false);
    expect(auth.can('contributions.write')).toBe(true);
  });

  it('lets a denomination admin act on each sede of their denomination only', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login('andres.molina@montedesion.example', DEMO_PASSWORD));

    const congregationIds = user.selectableScopes.map((scope) => scope.congregationId);
    expect(congregationIds).toEqual([null, 1, 2, 3]);
    auth.selectScope(user.selectableScopes[2]);
    expect(auth.can('congregations.manage')).toBe(true);
  });

  it('ignores revoked roles', async () => {
    const auth = setup();
    await firstValueFrom(auth.login('marta.castillo@montedesion.example', DEMO_PASSWORD));

    expect(auth.activeRoles()).toEqual(['SECRETARY']);
    expect(auth.can('contributions.write')).toBe(false);
  });

  it('answers wrong credentials with a generic message and locks after repeated failures', async () => {
    const auth = setup();
    const email = 'laura.gomez@iglesia238.example';

    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      const error = await firstValueFrom(auth.login(email, 'wrong')).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_CREDENTIALS');
    }
    await firstValueFrom(auth.login(email, 'wrong')).catch(() => undefined);

    const locked = await firstValueFrom(auth.login(email, DEMO_PASSWORD)).catch((e: unknown) => e);
    expect((locked as DomainError).code).toBe('ACCOUNT_LOCKED');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('does not reveal unknown emails', async () => {
    const auth = setup();
    const error = await firstValueFrom(auth.login('nadie@correo.example', DEMO_PASSWORD)).catch((e: unknown) => e);

    expect((error as DomainError).message).toBe('Correo o contraseña incorrectos.');
  });

  it('restores the session after a reload and clears it on logout', async () => {
    const auth = setup();
    await firstValueFrom(auth.login('daniel.herrera@montedesion.example', DEMO_PASSWORD));

    const reloaded = TestBed.runInInjectionContext(() => new AuthService());
    await reloaded.ensureRestored();
    expect(reloaded.user()?.displayName).toBe('Pastor Daniel Herrera');

    await firstValueFrom(reloaded.logout());
    const afterLogout = TestBed.runInInjectionContext(() => new AuthService());
    await afterLogout.ensureRestored();
    expect(afterLogout.isAuthenticated()).toBe(false);
  });

  it('keeps the chosen sede and its permissions after a reload', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login('paola.ruiz@montedesion.example', DEMO_PASSWORD));
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === 3)!);

    const reloaded = TestBed.runInInjectionContext(() => new AuthService());
    await reloaded.ensureRestored();

    expect(reloaded.tenant()).toEqual({ denominationId: 1, congregationId: 3 });
    expect(reloaded.activeRoles()).toEqual(['TREASURER']);
    expect(reloaded.can('cash-transactions.write')).toBe(true);
  });

  it('keeps a denomination admin on the single sede they chose after a reload', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login('andres.molina@montedesion.example', DEMO_PASSWORD));
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === 2)!);

    const reloaded = TestBed.runInInjectionContext(() => new AuthService());
    await reloaded.ensureRestored();

    expect(reloaded.tenant()).toEqual({ denominationId: 1, congregationId: 2 });
  });

  it('starts on the first scope after logout or when the stored scope is no longer available', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login('paola.ruiz@montedesion.example', DEMO_PASSWORD));
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === 3)!);
    await firstValueFrom(auth.logout());

    await firstValueFrom(auth.login('paola.ruiz@montedesion.example', DEMO_PASSWORD));
    expect(auth.tenant().congregationId).toBe(2);

    sessionStorage.setItem('iglesia238.activeScope', 'CONGREGATION:2:9');
    const reloaded = TestBed.runInInjectionContext(() => new AuthService());
    await reloaded.ensureRestored();
    expect(reloaded.tenant()).toEqual({ denominationId: 1, congregationId: 2 });
  });
});
