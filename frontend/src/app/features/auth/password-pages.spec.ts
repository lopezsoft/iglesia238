import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../core/auth/auth.gateway';
import { SessionUser } from '../../core/auth/session.model';
import { DomainError } from '../../core/errors/domain-error';
import { AcceptInvitationPage } from './accept-invitation/accept-invitation.page';
import { ResetPasswordPage } from './reset-password/reset-password.page';

class FakeGateway extends AuthGateway {
  resets: { token: string; password: string }[] = [];
  accepted: { token: string; password: string }[] = [];
  invitation: Observable<InvitationInfo> = of({ email: 'nuevo@iglesia.example', displayName: 'Nuevo Usuario', expiresAt: null });

  login(): Observable<SessionUser> {
    return throwError(() => new Error('not used'));
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
  confirmPasswordReset(token: string, password: string): Observable<void> {
    this.resets.push({ token, password });
    return of(undefined);
  }
  getInvitation(): Observable<InvitationInfo> {
    return this.invitation;
  }
  acceptInvitation(token: string, password: string): Observable<void> {
    this.accepted.push({ token, password });
    return of(undefined);
  }
  confirmEmail = () => of(undefined);
  resendEmailVerification = () => of({ devVerificationLink: null });
  changePassword(): Observable<void> {
    return of(undefined);
  }
}

function setup(): FakeGateway {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthGateway, useClass: FakeGateway }],
  });
  return TestBed.inject(AuthGateway) as FakeGateway;
}

function fill(element: HTMLElement, password: string, confirm: string): void {
  const [first, second] = Array.from(element.querySelectorAll<HTMLInputElement>('input'));
  for (const [input, value] of [[first, password], [second, confirm]] as const) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
}

describe('ResetPasswordPage', () => {
  it('rejects a link without token and offers a new request', async () => {
    setup();
    const fixture = TestBed.createComponent(ResetPasswordPage);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('El enlace no es válido');
    expect(element.querySelector('a[href="/login/recover-password"]')).not.toBeNull();
    expect(element.querySelector('form')).toBeNull();
  });

  it('does not send mismatching passwords and confirms with the token when they match', async () => {
    const gateway = setup();
    const fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.componentRef.setInput('token', 'one-time-token');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    fill(element, 'una-clave-larga-1', 'otra-clave-larga-2');
    await fixture.whenStable();
    expect(gateway.resets).toHaveLength(0);
    expect(element.textContent).toContain('Las contraseñas no coinciden.');

    fill(element, 'una-clave-larga-1', 'una-clave-larga-1');
    await fixture.whenStable();
    expect(gateway.resets).toEqual([{ token: 'one-time-token', password: 'una-clave-larga-1' }]);
    expect(element.textContent).toContain('Contraseña actualizada');
  });

  it('takes the one-time token out of the address once it has read it, and still uses it', async () => {
    const gateway = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.componentRef.setInput('token', 'one-time-token');
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { token: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    // The router drops ?token= and the input goes away; the page keeps its own copy.
    fixture.componentRef.setInput('token', undefined);
    await fixture.whenStable();
    fill(fixture.nativeElement as HTMLElement, 'una-clave-larga-1', 'una-clave-larga-1');
    await fixture.whenStable();

    expect(gateway.resets).toEqual([{ token: 'one-time-token', password: 'una-clave-larga-1' }]);
  });

  it('requires the minimum length', async () => {
    const gateway = setup();
    const fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.componentRef.setInput('token', 't');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    fill(element, 'corta', 'corta');
    await fixture.whenStable();

    expect(gateway.resets).toHaveLength(0);
    expect(element.textContent).toContain('al menos 10 caracteres');
  });
});

describe('AcceptInvitationPage', () => {
  it('shows who is being invited and activates the account with the chosen password', async () => {
    const gateway = setup();
    const fixture = TestBed.createComponent(AcceptInvitationPage);
    fixture.componentRef.setInput('token', 'invite-token');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('nuevo@iglesia.example');

    fill(element, 'clave-segura-123', 'clave-segura-123');
    await fixture.whenStable();

    expect(gateway.accepted).toEqual([{ token: 'invite-token', password: 'clave-segura-123' }]);
    expect(element.textContent).toContain('Cuenta activada');
  });

  it('takes the invitation token out of the address and still activates with it', async () => {
    const gateway = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const fixture = TestBed.createComponent(AcceptInvitationPage);
    fixture.componentRef.setInput('token', 'invite-token');
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { token: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    fixture.componentRef.setInput('token', undefined);
    await fixture.whenStable();
    fill(fixture.nativeElement as HTMLElement, 'clave-segura-123', 'clave-segura-123');
    await fixture.whenStable();

    expect(gateway.accepted).toEqual([{ token: 'invite-token', password: 'clave-segura-123' }]);
  });

  it('explains an invalid or expired invitation with the message of the API', async () => {
    const gateway = setup();
    gateway.invitation = throwError(() => new DomainError('TOKEN_INVALID_OR_EXPIRED', 'La invitación venció.'));
    const fixture = TestBed.createComponent(AcceptInvitationPage);
    fixture.componentRef.setInput('token', 'old');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('La invitación venció.');
    expect(element.querySelector('form')).toBeNull();
  });
});
