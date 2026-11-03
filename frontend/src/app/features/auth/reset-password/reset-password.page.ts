import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { IconComponent } from '../../../shared/ui/icon.component';
import { SpinnerComponent } from '../../../shared/ui/spinner.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { AuthFrameComponent } from '../components/auth-frame.component';
import { stripTokenFromUrl } from '../strip-token';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  newPasswordError,
  passwordsMatch,
} from '../password-form';

/** A-05: set a new password with the one-time token of the recovery link (`?token=`). */
@Component({
  selector: 'app-reset-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, SpinnerComponent, TextFieldComponent, AuthFrameComponent],
  templateUrl: './reset-password.page.html',
  styleUrl: '../auth-page.scss',
})
export class ResetPasswordPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** `?token=` of the link the person received. It is read once and then removed from the address. */
  readonly token = input<string | undefined>(undefined);
  protected readonly linkToken = signal<string | null>(null);

  protected readonly hint = PASSWORD_HINT;
  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      password: [
        '',
        [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH), Validators.maxLength(MAX_PASSWORD_LENGTH)],
      ],
      confirm: ['', [Validators.required]],
    },
    { validators: passwordsMatch('password', 'confirm') },
  );
  protected readonly pending = signal(false);
  protected readonly done = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const token = this.token();
    if (token) {
      this.linkToken.set(token);
      stripTokenFromUrl(this.router);
    }
  }

  protected passwordError(): string | null {
    return newPasswordError(this.form.controls.password);
  }

  protected confirmError(): string | null {
    const control = this.form.controls.confirm;
    if (!control.touched) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Repite la nueva contraseña.';
    }
    return this.form.hasError('mismatch') ? 'Las contraseñas no coinciden.' : null;
  }

  protected async submit(): Promise<void> {
    const token = this.linkToken();
    if (this.pending() || !token) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.auth.confirmPasswordReset(token, this.form.getRawValue().password), {
        defaultValue: undefined,
      });
      this.done.set(true);
    } catch (error) {
      this.errorMessage.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
