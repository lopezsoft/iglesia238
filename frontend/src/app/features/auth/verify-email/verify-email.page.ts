import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { IconComponent } from '../../../shared/ui/icon.component';
import { SpinnerComponent } from '../../../shared/ui/spinner.component';
import { AuthFrameComponent } from '../components/auth-frame.component';
import { stripTokenFromUrl } from '../strip-token';

type VerifyState = 'checking' | 'done' | 'invalid';

/**
 * Confirms the e-mail address with the one-time token of the link (`?token=`). It works with or without a
 * session: a signed-in person gets their session refreshed and enters the app, anyone else goes to the login.
 */
@Component({
  selector: 'app-verify-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, SpinnerComponent, AuthFrameComponent],
  styleUrl: '../auth-page.scss',
  template: `
    <app-auth-frame labelledBy="verify-title">
      <div class="auth-page__heading">
        <h1 id="verify-title" class="auth-page__title">Confirma tu correo</h1>
        <p class="text-muted">Estamos validando el enlace que recibiste.</p>
      </div>

      @switch (state()) {
        @case ('checking') {
          <p class="text-muted" role="status"><app-spinner /> Confirmando tu correo…</p>
        }
        @case ('invalid') {
          <div class="alert alert--danger auth-page__notice" role="alert">
            <app-icon name="alert" [size]="18" />
            <div>
              <p class="auth-page__notice-title">No pudimos confirmar tu correo</p>
              <p>{{ invalidMessage() }}</p>
            </div>
          </div>
          @if (signedIn()) {
            <a class="btn btn--primary btn--lg btn--block" routerLink="/confirm-email">Pedir un enlace nuevo</a>
          } @else {
            <p class="text-small text-muted">
              Inicia sesión y, en la pantalla «Confirma tu correo», pide un enlace nuevo.
            </p>
            <a class="btn btn--primary btn--lg btn--block" routerLink="/login">Ir a iniciar sesión</a>
          }
        }
        @default {
          <div class="alert alert--success auth-page__notice" role="status">
            <app-icon name="check" [size]="18" />
            <div>
              <p class="auth-page__notice-title">Correo confirmado</p>
              <p>Tu cuenta ya está habilitada para usar la aplicación.</p>
            </div>
          </div>
          @if (signedIn()) {
            <a class="btn btn--primary btn--lg btn--block" routerLink="/dashboard">Entrar a la aplicación</a>
          } @else {
            <a class="btn btn--primary btn--lg btn--block" routerLink="/login">Continuar a iniciar sesión</a>
          }
        }
      }
    </app-auth-frame>
  `,
})
export class VerifyEmailPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** `?token=` of the link. It is read once and then removed from the address. */
  readonly token = input<string | undefined>(undefined);

  protected readonly state = signal<VerifyState>('checking');
  protected readonly invalidMessage = signal('El enlace no es válido o ya venció.');
  protected readonly signedIn = this.auth.isAuthenticated;

  async ngOnInit(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.invalidMessage.set('Abre el enlace completo que recibiste por correo.');
      this.state.set('invalid');
      return;
    }
    stripTokenFromUrl(this.router);
    try {
      // The page is outside the guards: look for a session first to know whether someone is signed in.
      await this.auth.ensureRestored();
      await firstValueFrom(this.auth.confirmEmail(token), { defaultValue: undefined });
      if (this.auth.isAuthenticated()) {
        await this.auth.refreshSession();
      }
      this.state.set('done');
    } catch (error) {
      this.invalidMessage.set(`${userMessage(error)} Pide un enlace nuevo para confirmar tu correo.`);
      this.state.set('invalid');
    }
  }
}
