import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DebugService } from '../../../core/debug/debug.service';
import { userMessage } from '../../../core/errors/domain-error';
import { DevLinkBoxComponent } from '../../../shared/ui/dev-link-box.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { SpinnerComponent } from '../../../shared/ui/spinner.component';

/**
 * The only page of an account whose e-mail is not confirmed yet. It explains why the app is locked, resends
 * the confirmation e-mail and lets the person sign out or check again after confirming in another tab.
 */
@Component({
  selector: 'app-confirm-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DevLinkBoxComponent, IconComponent, SpinnerComponent],
  styleUrl: './confirm-email.page.scss',
  template: `
    <section class="confirm card" aria-labelledby="confirm-email-title">
      <span class="confirm__icon"><app-icon name="mail" [size]="28" /></span>
      <h1 id="confirm-email-title" class="confirm__title">Confirma tu correo</h1>
      <p class="confirm__lead">
        Enviamos un enlace de confirmación a <strong>{{ email() }}</strong
        >. Hasta que lo abras, la aplicación permanece bloqueada: no podrás entrar a ningún módulo.
      </p>
      <p class="text-muted text-small">Revisa también la carpeta de correo no deseado.</p>

      @if (message(); as text) {
        <p class="alert alert--success" role="status">
          <app-icon name="check" [size]="18" />
          <span>{{ text }}</span>
        </p>
      }
      @if (errorMessage(); as text) {
        <p class="alert alert--danger" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ text }}</span>
        </p>
      }
      @if (devLink(); as link) {
        <app-dev-link-box [link]="link" />
      }

      <div class="cluster confirm__actions">
        <button type="button" class="btn btn--primary" [disabled]="resending()" (click)="resend()">
          @if (resending()) {
            <app-spinner />
            Enviando…
          } @else {
            <app-icon name="mail" [size]="16" />
            Reenviar correo
          }
        </button>
        <button type="button" class="btn btn--secondary" [disabled]="checking()" (click)="check()">
          <app-icon name="refresh" [size]="16" />
          Ya lo confirmé
        </button>
        <button type="button" class="btn btn--ghost" (click)="logout()">
          <app-icon name="log-out" [size]="16" />
          Cerrar sesión
        </button>
      </div>
    </section>
  `,
})
export class ConfirmEmailPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly debug = inject(DebugService);

  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly resending = signal(false);
  protected readonly checking = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly devLink = signal<string | null>(null);

  protected async resend(): Promise<void> {
    if (this.resending()) {
      return;
    }
    this.resending.set(true);
    this.message.set(null);
    this.errorMessage.set(null);
    try {
      const result = await firstValueFrom(this.auth.resendEmailVerification());
      this.devLink.set(result.devVerificationLink);
      this.message.set(
        result.devVerificationLink
          ? 'El servidor no tiene SMTP configurado: usa el enlace de abajo para confirmar.'
          : 'Te enviamos un correo nuevo. El enlace anterior deja de funcionar.',
      );
    } catch (error) {
      this.errorMessage.set(userMessage(error));
    } finally {
      this.resending.set(false);
    }
  }

  /** Reads the session again: the e-mail may have been confirmed from another tab or device. */
  protected async check(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    this.message.set(null);
    this.errorMessage.set(null);
    try {
      await this.auth.refreshSession();
      if (this.auth.emailVerified()) {
        await this.router.navigateByUrl('/dashboard');
      } else {
        this.errorMessage.set('Todavía no vemos tu correo confirmado. Abre el enlace que te enviamos.');
      }
    } finally {
      this.checking.set(false);
    }
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.debug.error('Logout failed', error),
    });
  }
}
