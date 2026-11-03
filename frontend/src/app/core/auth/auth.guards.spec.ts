import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Route, Router, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from './auth.gateway';
import { authGuard, permissionGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { SCRIPTED_PASSWORD, ScriptedAuthGateway } from './testing/scripted-auth.gateway';
import { SEDE_UNO, sessionOf, treasurer } from './testing/scripted-sessions';

function setup(): { auth: AuthService; router: Router } {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthGateway, useValue: new ScriptedAuthGateway([sessionOf('tesorera@iglesia.example', 'Tesorera Uno', [treasurer(SEDE_UNO)], [SEDE_UNO])]) }],
  });
  return { auth: TestBed.inject(AuthService), router: TestBed.inject(Router) };
}

const route: Route = {};
const snapshot = {} as Parameters<CanMatchFn>[2];

function run(guard: CanMatchFn, segments: UrlSegment[] = []) {
  return TestBed.runInInjectionContext(() => guard(route, segments, snapshot));
}

describe('route guards', () => {
  it('sends anonymous users to the login with the requested URL', async () => {
    const { router } = setup();
    const result = await run(authGuard, [new UrlSegment('members', {}), new UrlSegment('12', {})]);

    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fmembers%2F12');
  });

  it('opens a module only with its permission in the active scope', async () => {
    const { auth, router } = setup();
    await firstValueFrom(auth.login('tesorera@iglesia.example', SCRIPTED_PASSWORD));

    const allowed = await run(permissionGuard('contributions.read'));
    const denied = await run(permissionGuard('members.read'));

    expect(allowed).toBe(true);
    expect(router.serializeUrl(denied as UrlTree)).toBe('/forbidden');
  });
});
