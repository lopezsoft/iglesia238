import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../core/auth/auth.gateway';
import { SessionUser } from '../../../core/auth/session.model';
import { DomainError } from '../../../core/errors/domain-error';
import { LoginPage } from './login.page';

class RejectingGateway extends AuthGateway {
  calls = 0;

  login(): Observable<SessionUser> {
    this.calls++;
    return throwError(() => new DomainError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'));
  }
  restore(): Observable<SessionUser | null> {
    return of(null);
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

class RateLimitedGateway extends RejectingGateway {
  override login(): Observable<SessionUser> {
    this.calls++;
    return throwError(
      () => new DomainError('RATE_LIMITED', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 429),
    );
  }
}

async function render(gateway: typeof RejectingGateway = RejectingGateway) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthGateway, useClass: gateway }],
  });
  const fixture = TestBed.createComponent(LoginPage);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement, gateway: TestBed.inject(AuthGateway) as RejectingGateway };
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('LoginPage', () => {
  it('is the split login with the brand panel and no demo accounts or banners', async () => {
    const { element } = await render();

    expect(element.querySelector('app-auth-brand-panel')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toContain('Bienvenido de nuevo');
    expect(element.textContent).not.toContain('Modo demostración');
    expect(element.textContent).not.toContain('Cuentas de demostración');
    expect(element.querySelector('a[href="/apply"]')?.textContent).toContain('Inscríbete como miembro');
    expect(element.querySelector('a[href="/login/recover-password"]')?.textContent).toContain('¿La olvidaste?');
  });

  it('asks for the missing data instead of calling the API', async () => {
    const { fixture, element, gateway } = await render();

    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(gateway.calls).toBe(0);
    expect(element.textContent).toContain('Escribe tu correo.');
    expect(element.textContent).toContain('Escribe tu contraseña.');
  });

  it('shows the generic message of a rejected login and stays on the screen', async () => {
    const { fixture, element, gateway } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    const [email, password] = Array.from(element.querySelectorAll<HTMLInputElement>('input'));
    type(email, 'ana@iglesia.example');
    type(password, 'incorrecta');
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(gateway.calls).toBe(1);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Correo o contraseña incorrectos.');
    expect(navigate).not.toHaveBeenCalled();
    // A wrong password keeps the hint about the lock.
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('15 minutos');
  });

  it('offers to register a sede next to the membership sign-up, with text that matches the new flow', async () => {
    const { element } = await render();

    const links = Array.from(element.querySelectorAll('.login__alternatives a')).map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent?.trim(),
    }));
    expect(links).toEqual([
      { href: '/apply', text: 'Inscríbete como miembro' },
      { href: '/register-congregation', text: 'Registrar mi sede' },
    ]);
    expect(element.textContent).not.toContain('al administrador de tu denominación');
    expect(element.textContent).toContain('¿Tu iglesia aún no está en el sistema?');
  });

  it('sends an account with an unconfirmed e-mail to the locked page instead of the requested one', async () => {
    class UnconfirmedGateway extends RejectingGateway {
      override login(): Observable<SessionUser> {
        return of({
          id: 1,
          displayName: 'Gestora Nueva',
          email: 'nueva@iglesia.example',
          emailVerified: false,
          assignments: [],
          selectableScopes: [],
        });
      }
    }
    const { fixture, element } = await render(UnconfirmedGateway);
    fixture.componentRef.setInput('returnUrl', '/members');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const [email, password] = Array.from(element.querySelectorAll<HTMLInputElement>('input'));
    type(email, 'nueva@iglesia.example');
    type(password, 'una-clave-larga-1');
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/confirm-email');
  });

  it('enters the locked state when the API rate-limits the connection (429 RATE_LIMITED)', async () => {
    const { fixture, element } = await render(RateLimitedGateway);

    const [email, password] = Array.from(element.querySelectorAll<HTMLInputElement>('input'));
    type(email, 'ana@iglesia.example');
    type(password, 'incorrecta');
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Demasiados intentos');
    // The locked state shows the lock icon and drops the "check your data" hint.
    expect(alert?.textContent).not.toContain('Revisa tus datos');
  });
});
