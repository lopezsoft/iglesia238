import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, EmailVerificationResend } from '../../core/auth/auth.gateway';
import { AuthService } from '../../core/auth/auth.service';
import { SCRIPTED_PASSWORD, ScriptedAuthGateway } from '../../core/auth/testing/scripted-auth.gateway';
import { SEDE_UNO, secretary, sessionOf } from '../../core/auth/testing/scripted-sessions';
import { SessionUser } from '../../core/auth/session.model';
import { DomainError } from '../../core/errors/domain-error';
import { ConfirmEmailPage } from './confirm-email/confirm-email.page';
import { VerifyEmailPage } from './verify-email/verify-email.page';

const UNCONFIRMED = sessionOf('nueva@iglesia.example', 'Gestora Nueva', [secretary(SEDE_UNO)], [SEDE_UNO], false);

class EmailGateway extends ScriptedAuthGateway {
  readonly confirmed: string[] = [];
  resends = 0;
  resendResult: EmailVerificationResend = { devVerificationLink: null };
  confirmError: DomainError | null = null;
  /** What GET /auth/me answers. */
  fresh: SessionUser = UNCONFIRMED;

  override confirmEmail(token?: string): Observable<void> {
    this.confirmed.push(token ?? '');
    return this.confirmError ? throwError(() => this.confirmError) : of(undefined);
  }
  override resendEmailVerification(): Observable<EmailVerificationResend> {
    this.resends++;
    return of(this.resendResult);
  }
  override session(): Observable<SessionUser | null> {
    return of(this.fresh);
  }
}

function setup(): EmailGateway {
  sessionStorage.clear();
  const gateway = new EmailGateway([UNCONFIRMED]);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthGateway, useValue: gateway }],
  });
  return gateway;
}

async function signIn(): Promise<void> {
  await firstValueFrom(TestBed.inject(AuthService).login('nueva@iglesia.example', SCRIPTED_PASSWORD));
}

describe('ConfirmEmailPage', () => {
  async function render() {
    const gateway = setup();
    await signIn();
    const fixture = TestBed.createComponent(ConfirmEmailPage);
    await fixture.whenStable();
    return { fixture, gateway, element: fixture.nativeElement as HTMLElement };
  }

  function button(element: HTMLElement, label: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
      item.textContent?.includes(label),
    )!;
  }

  it('explains the lock and offers to resend the e-mail or sign out', async () => {
    const { element } = await render();

    expect(element.querySelector('h1')?.textContent).toContain('Confirma tu correo');
    expect(element.textContent).toContain('nueva@iglesia.example');
    expect(element.textContent).toContain('la aplicación permanece bloqueada');
    expect(button(element, 'Reenviar correo')).toBeDefined();
    expect(button(element, 'Cerrar sesión')).toBeDefined();
    expect(element.querySelector('app-dev-link-box')).toBeNull();
  });

  it('resends the e-mail and confirms it', async () => {
    const { element, fixture, gateway } = await render();

    button(element, 'Reenviar correo').click();
    await fixture.whenStable();

    expect(gateway.resends).toBe(1);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Te enviamos un correo nuevo');
    expect(element.querySelector('app-dev-link-box')).toBeNull();
  });

  it('shows the development link when the server has no SMTP', async () => {
    const { element, fixture, gateway } = await render();
    gateway.resendResult = { devVerificationLink: 'http://localhost:4200/login/verify-email?token=dev' };

    button(element, 'Reenviar correo').click();
    await fixture.whenStable();
    fixture.detectChanges();

    const box = element.querySelector('app-dev-link-box')!;
    expect(box.textContent).toContain('Modo desarrollo: SMTP no configurado');
    expect(box.querySelector<HTMLInputElement>('input')?.value).toContain('/login/verify-email?token=dev');
  });

  it('signs out and goes to the login', async () => {
    const { element, fixture } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    button(element, 'Cerrar sesión').click();
    await fixture.whenStable();

    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('enters the app once the session says the e-mail is confirmed', async () => {
    const { element, fixture, gateway } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    gateway.fresh = { ...UNCONFIRMED, emailVerified: true };

    button(element, 'Ya lo confirmé').click();
    await fixture.whenStable();

    expect(TestBed.inject(AuthService).emailVerified()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('says so when the e-mail is still unconfirmed', async () => {
    const { element, fixture } = await render();

    button(element, 'Ya lo confirmé').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Todavía no vemos tu correo confirmado');
  });
});

describe('VerifyEmailPage', () => {
  async function render(token: string | undefined) {
    const gateway = setup();
    const strip = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.componentRef.setInput('token', token);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, gateway, strip, element: fixture.nativeElement as HTMLElement };
  }

  it('rejects a link without token', async () => {
    const { element, gateway } = await render(undefined);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos confirmar tu correo');
    expect(gateway.confirmed).toEqual([]);
  });

  it('confirms with the token, takes it out of the address and offers the login to a guest', async () => {
    const { element, gateway, strip } = await render('one-time-token');

    expect(gateway.confirmed).toEqual(['one-time-token']);
    expect(strip).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { token: null }, replaceUrl: true }));
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Correo confirmado');
    expect(element.querySelector('a[href="/login"]')?.textContent).toContain('iniciar sesión');
  });

  it('refreshes the session of a signed-in person and lets them enter the app', async () => {
    const setupFresh = async () => {
      const gateway = setup();
      gateway.fresh = { ...UNCONFIRMED, emailVerified: true };
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await signIn();
      expect(TestBed.inject(AuthService).emailVerified()).toBe(false);
      const fixture = TestBed.createComponent(VerifyEmailPage);
      fixture.componentRef.setInput('token', 'tok');
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };

    const element = await setupFresh();

    expect(TestBed.inject(AuthService).emailVerified()).toBe(true);
    expect(element.querySelector('a[href="/dashboard"]')?.textContent).toContain('Entrar a la aplicación');
  });

  it('shows the API message when the token is invalid or expired', async () => {
    const gateway = setup();
    gateway.confirmError = new DomainError('INVALID_TOKEN', 'El enlace venció.', 400);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.componentRef.setInput('token', 'old');
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('El enlace venció.');
    expect(element.querySelector('a[href="/login"]')).not.toBeNull();
  });
});
