import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../core/auth/auth.gateway';
import { AuthService } from '../core/auth/auth.service';
import { Scope, SessionUser } from '../core/auth/session.model';
import { environment } from '../../environments/environment';
import { ShellComponent } from './shell.component';

const denomination: Scope = { kind: 'DENOMINATION', denominationId: 2, congregationId: null, label: 'Toda la denominación' };
const sedeNorte: Scope = { kind: 'CONGREGATION', denominationId: 2, congregationId: 5, label: 'Sede Norte' };

const session: SessionUser = {
  id: 1,
  displayName: 'Lucía Gómez',
  email: 'lucia@iglesia.example',
  assignments: [
    {
      role: 'DENOMINATION_ADMIN',
      roleName: 'Administrador de denominación',
      permissions: ['congregations.manage', 'users.manage', 'members.read'],
      scope: denomination,
    },
  ],
  selectableScopes: [denomination, sedeNorte],
};

class FakeAuthGateway extends AuthGateway {
  login(): Observable<SessionUser> {
    return of(session);
  }
  restore(): Observable<SessionUser | null> {
    return of(session);
  }
  logout(): Observable<void> {
    return of(undefined);
  }
  requestPasswordReset(): Observable<void> {
    return of(undefined);
  }
  confirmPasswordReset(): Observable<void> {
    return of(undefined);
  }
  getInvitation(): Observable<InvitationInfo> {
    return of({ email: 'x@y.z', displayName: null, expiresAt: null });
  }
  acceptInvitation(): Observable<void> {
    return of(undefined);
  }
  changePassword(): Observable<void> {
    return of(undefined);
  }
}

async function render() {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthGateway, useClass: FakeAuthGateway },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('lucia@iglesia.example', 'x'));
  const fixture = TestBed.createComponent(ShellComponent);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('ShellComponent', () => {
  it('renders the icon rail with a short label and a tooltip per permitted module', async () => {
    const { element } = await render();

    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('.rail__link'));
    const shortLabels = links.map((link) => link.querySelector('.rail__label')?.textContent?.trim());
    expect(shortLabels).toEqual(['Inicio', 'Sedes', 'Política', 'Usuarios', 'Miembros']);
    expect(links.find((link) => link.getAttribute('title') === 'Sedes y razones sociales')).toBeDefined();
  });

  it('has no demo banner and shows the app version in the footer', async () => {
    const { element } = await render();

    expect(element.querySelector('.demo-banner')).toBeNull();
    expect(element.textContent).not.toContain('Modo demostración');
    expect(element.querySelector('app-footer')?.textContent).toContain(`Versión ${environment.appVersion}`);
  });

  it('offers only the quick actions the active scope allows', async () => {
    const { element, fixture } = await render();

    element.querySelector<HTMLButtonElement>('app-quick-create-menu button[aria-haspopup="menu"]')!.click();
    await fixture.whenStable();

    const labels = Array.from(element.querySelectorAll('app-quick-create-menu [role="menuitem"]')).map((item) => item.textContent?.trim());
    expect(labels).toContain('Invitar usuario');
    expect(labels).toContain('Nueva sede');
    expect(labels).not.toContain('Registrar aporte');
  });

  it('switches the scope from the pill and returns to the home page', async () => {
    const { element, fixture } = await render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const auth = TestBed.inject(AuthService);

    element.querySelector<HTMLButtonElement>('app-scope-switcher button[aria-haspopup="menu"]')!.click();
    await fixture.whenStable();
    const options = Array.from(element.querySelectorAll<HTMLElement>('app-scope-switcher [role="menuitemradio"]'));
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false']);

    options[1].click();
    await fixture.whenStable();

    expect(auth.activeScope()?.label).toBe('Sede Norte');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('checks the API health for the status icon', async () => {
    await render();

    TestBed.inject(HttpTestingController).expectOne('/api/health').flush({ status: 'ok' });
  });
});
