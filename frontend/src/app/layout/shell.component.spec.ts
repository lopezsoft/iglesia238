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
  emailVerified: true,
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
  confirmEmail = () => of(undefined);
  resendEmailVerification = () => of({ devVerificationLink: null });
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
    expect(links.every((link) => link.getAttribute('title') === null)).toBe(true);
    expect(links.find((link) => link.getAttribute('data-tooltip') === 'Sedes y razones sociales')).toBeDefined();
  });

  it('has no demo banner and shows the copyright and app version in the footer', async () => {
    const { element } = await render();

    expect(element.querySelector('.demo-banner')).toBeNull();
    expect(element.textContent).not.toContain('Modo demostración');
    const footer = element.querySelector('app-footer');
    expect(footer?.textContent).toContain('lopezsoft.net.co');
    expect(footer?.textContent).toContain(`Versión ${environment.appVersion}`);
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

  describe('while the e-mail is not confirmed', () => {
    async function renderLocked() {
      sessionStorage.clear();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: AuthGateway, useClass: LockedAuthGateway },
        ],
      });
      await firstValueFrom(TestBed.inject(AuthService).login('lucia@iglesia.example', 'x'));
      const fixture = TestBed.createComponent(ShellComponent);
      await fixture.whenStable();
      return { fixture, element: fixture.nativeElement as HTMLElement };
    }

    it('shows no module, only the "Confirma tu correo" entry', async () => {
      const { element } = await renderLocked();

      const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('.rail__link'));
      expect(links.map((link) => link.getAttribute('href'))).toEqual(['/confirm-email']);
      expect(links[0].getAttribute('title')).toBeNull();
      expect(links[0].getAttribute('data-tooltip')).toBe('Confirma tu correo');
      expect(element.querySelector('a[href="/users"]')).toBeNull();
      expect(element.querySelector('.rail__brand')?.getAttribute('href')).toBe('/confirm-email');
    });

    it('hides the quick actions, the scope switcher and the profile links', async () => {
      const { element, fixture } = await renderLocked();

      expect(element.querySelector('app-quick-create-menu')).toBeNull();
      expect(element.querySelector('app-scope-switcher')).toBeNull();

      element.querySelector<HTMLButtonElement>('app-user-menu button[aria-haspopup="menu"]')!.click();
      await fixture.whenStable();

      const items = Array.from(element.querySelectorAll('app-user-menu [role="menuitem"]')).map((item) => item.textContent?.trim());
      expect(items).toEqual(['Cerrar sesión']);
    });
  });
});

class LockedAuthGateway extends FakeAuthGateway {
  override login(): Observable<SessionUser> {
    return of({ ...session, emailVerified: false });
  }
  override restore(): Observable<SessionUser | null> {
    return of({ ...session, emailVerified: false });
  }
}
