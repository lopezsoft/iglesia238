import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DomainError } from '../errors/domain-error';
import { AuthGateway } from './auth.gateway';
import { AuthService } from './auth.service';
import { SCRIPTED_PASSWORD, ScriptedAuthGateway } from './testing/scripted-auth.gateway';
import {
  DENOMINATION,
  SEDE_DOS,
  SEDE_TRES,
  SEDE_UNO,
  denominationAdmin,
  secretary,
  sessionOf,
  treasurer,
} from './testing/scripted-sessions';

const TREASURER_EMAIL = 'tesorera@iglesia.example';
const TWO_SEDES_EMAIL = 'dos-sedes@iglesia.example';
const ADMIN_EMAIL = 'admin@iglesia.example';

function setup(): AuthService {
  sessionStorage.clear();
  const gateway = new ScriptedAuthGateway([
    sessionOf(TREASURER_EMAIL, 'Tesorera Uno', [treasurer(SEDE_UNO)], [SEDE_UNO]),
    sessionOf(
      TWO_SEDES_EMAIL,
      'Persona Dos Sedes',
      [secretary(SEDE_DOS), treasurer(SEDE_TRES)],
      [SEDE_DOS, SEDE_TRES],
    ),
    sessionOf(
      ADMIN_EMAIL,
      'Administración',
      [denominationAdmin(DENOMINATION)],
      [DENOMINATION, SEDE_UNO, SEDE_DOS, SEDE_TRES],
    ),
  ]);
  TestBed.configureTestingModule({ providers: [{ provide: AuthGateway, useValue: gateway }] });
  return TestBed.inject(AuthService);
}

function reload(): AuthService {
  return TestBed.runInInjectionContext(() => new AuthService());
}

describe('AuthService', () => {
  it('grants the treasurer only the treasury permissions in their sede', async () => {
    const auth = setup();
    await firstValueFrom(auth.login(TREASURER_EMAIL, SCRIPTED_PASSWORD));

    expect(auth.activeRoles()).toEqual(['TREASURER']);
    expect(auth.can('contributions.write')).toBe(true);
    expect(auth.can('members.read')).toBe(false);
    expect(auth.tenant()).toEqual({ denominationId: 1, congregationId: 1 });
  });

  it('switches permissions with the active scope for a user with roles in two sedes', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login(TWO_SEDES_EMAIL, SCRIPTED_PASSWORD));

    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === 2)!);
    expect(auth.activeRoles()).toEqual(['SECRETARY']);
    expect(auth.can('attendance.write')).toBe(true);
    expect(auth.can('contributions.write')).toBe(false);

    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === 3)!);
    expect(auth.activeRoles()).toEqual(['TREASURER']);
    expect(auth.can('attendance.write')).toBe(false);
    expect(auth.can('contributions.write')).toBe(true);
  });

  it('lets a denomination admin act on each sede of their denomination', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login(ADMIN_EMAIL, SCRIPTED_PASSWORD));

    expect(user.selectableScopes.map((scope) => scope.congregationId)).toEqual([null, 1, 2, 3]);
    auth.selectScope(user.selectableScopes[2]);
    expect(auth.can('congregations.manage')).toBe(true);
  });

  it('answers wrong credentials with a generic message', async () => {
    const auth = setup();

    const wrongPassword = await firstValueFrom(auth.login(TREASURER_EMAIL, 'incorrecta')).catch((e: unknown) => e);
    const unknownEmail = await firstValueFrom(auth.login('nadie@correo.example', SCRIPTED_PASSWORD)).catch(
      (e: unknown) => e,
    );

    expect(wrongPassword).toBeInstanceOf(DomainError);
    expect((wrongPassword as DomainError).code).toBe('INVALID_CREDENTIALS');
    expect((unknownEmail as DomainError).message).toBe('Correo o contraseña incorrectos.');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('restores the session after a reload and clears it on logout', async () => {
    const auth = setup();
    await firstValueFrom(auth.login(TREASURER_EMAIL, SCRIPTED_PASSWORD));

    const reloaded = reload();
    await reloaded.ensureRestored();
    expect(reloaded.user()?.displayName).toBe('Tesorera Uno');

    await firstValueFrom(reloaded.logout());
    const afterLogout = reload();
    await afterLogout.ensureRestored();
    expect(afterLogout.isAuthenticated()).toBe(false);
  });

  it('keeps the chosen sede and its permissions after a reload', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login(TWO_SEDES_EMAIL, SCRIPTED_PASSWORD));
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === 3)!);

    const reloaded = reload();
    await reloaded.ensureRestored();

    expect(reloaded.tenant()).toEqual({ denominationId: 1, congregationId: 3 });
    expect(reloaded.activeRoles()).toEqual(['TREASURER']);
    expect(reloaded.can('cash-transactions.write')).toBe(true);
  });

  it('starts on the first scope after logout or when the stored scope is no longer available', async () => {
    const auth = setup();
    const user = await firstValueFrom(auth.login(TWO_SEDES_EMAIL, SCRIPTED_PASSWORD));
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === 3)!);
    await firstValueFrom(auth.logout());

    await firstValueFrom(auth.login(TWO_SEDES_EMAIL, SCRIPTED_PASSWORD));
    expect(auth.tenant().congregationId).toBe(2);

    sessionStorage.setItem('iglesia238.activeScope', 'CONGREGATION:1:9');
    const reloaded = reload();
    await reloaded.ensureRestored();
    expect(reloaded.tenant()).toEqual({ denominationId: 1, congregationId: 2 });
  });
});
