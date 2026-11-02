import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from '../../../core/auth/auth-policy';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { IconComponent } from '../../../shared/ui/icon.component';
import { AuthFrameComponent } from '../components/auth-frame.component';
import { DemoAccountsPanelComponent } from './components/demo-accounts-panel.component';
import { safeReturnUrl } from './return-url';

interface LoginFailure {
  readonly message: string;
  readonly locked: boolean;
}

/** A-01: sign in with email and password. */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, AuthFrameComponent, DemoAccountsPanelComponent],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly passwordInput = viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');

  /** `?returnUrl=` set by the auth guard; validated before navigating. */
  readonly returnUrl = input<string | undefined>(undefined);

  protected readonly demoMode = environment.demoMode;
  protected readonly maxFailedAttempts = MAX_FAILED_ATTEMPTS;
  protected readonly lockMinutes = LOCK_MINUTES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });
  protected readonly showPassword = signal(false);
  protected readonly pending = signal(false);
  protected readonly failure = signal<LoginFailure | null>(null);
  protected readonly passwordToggleLabel = computed(() =>
    this.showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña',
  );

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  protected useDemoAccount(email: string): void {
    this.form.controls.email.setValue(email);
    this.form.controls.password.reset();
    this.failure.set(null);
    this.passwordInput().nativeElement.focus();
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
        locked: error instanceof DomainError && error.code === 'ACCOUNT_LOCKED',
      });
      this.form.controls.password.reset();
    } finally {
      this.pending.set(false);
    }
  }
}
