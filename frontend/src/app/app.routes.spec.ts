import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthGateway } from './core/auth/auth.gateway';
import { ScriptedAuthGateway } from './core/auth/testing/scripted-auth.gateway';

async function navigateAsGuest(url: string) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      { provide: AuthGateway, useValue: new ScriptedAuthGateway([]) },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { harness, router: TestBed.inject(Router) };
}

describe('app routes for guests', () => {
  it('shows the 404 page for a mistyped public link instead of the staff login', async () => {
    const { harness, router } = await navigateAsGuest('/apply/estado');

    expect(router.url).toBe('/apply/estado');
    expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
  });

  it('shows the 404 page for an unknown URL under /login', async () => {
    const { harness, router } = await navigateAsGuest('/login/typo');

    expect(router.url).toBe('/login/typo');
    expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
  });

  it('still sends guests to the login for staff pages', async () => {
    const { router } = await navigateAsGuest('/members');

    expect(router.url).toBe('/login?returnUrl=%2Fmembers');
  });
});
