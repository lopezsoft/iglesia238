import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from '../../../core/auth/auth-policy';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { GreetingPillComponent } from '../../../shared/ui/greeting-pill.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { SpinnerComponent } from '../../../shared/ui/spinner.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { AuthFrameComponent } from '../components/auth-frame.component';
import { safeReturnUrl } from './return-url';

interface LoginFailure {
  readonly message: string;
  readonly locked: boolean;
}

/** A-01: sign in with email and password. */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IconComponent,
    SpinnerComponent,
    GreetingPillComponent,
    TextFieldComponent,
    AuthFrameComponent,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** `?returnUrl=` set by the auth guard; validated before navigating. */
  readonly returnUrl = input<string | undefined>(undefined);
  /** `?reason=expired` when the session ended while the person was working. */
  readonly reason = input<string | undefined>(undefined);

  protected readonly maxFailedAttempts = MAX_FAILED_ATTEMPTS;
  protected readonly lockMinutes = LOCK_MINUTES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });
  protected readonly pending = signal(false);
  protected readonly failure = signal<LoginFailure | null>(null);

  protected emailError(): string | null {
    const control = this.form.controls.email;
    if (!control.touched || control.valid) {
      return null;
    }
    return control.hasError('required') ? 'Escribe tu correo.' : 'Escribe un correo válido.';
  }

  protected passwordError(): string | null {
    const control = this.form.controls.password;
    return control.touched && control.invalid ? 'Escribe tu contraseña.' : null;
  }

  protected async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.pending.set(true);
    this.failure.set(null);
    try {
      await firstValueFrom(this.auth.login(email.trim(), password));
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (error) {
      this.failure.set({
        message: userMessage(error),
        // Too many attempts from this connection (429). A locked account answers like a wrong password.
        locked: error instanceof DomainError && (error.status === 429 || error.code === 'RATE_LIMITED'),
      });
      this.form.controls.password.reset();
    } finally {
      this.pending.set(false);
    }
  }
}
