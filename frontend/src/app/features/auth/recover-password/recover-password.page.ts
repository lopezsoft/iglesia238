import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { IconComponent } from '../../../shared/ui/icon.component';
import { AuthFrameComponent } from '../components/auth-frame.component';

/**
 * A-05: request a password reset link. The answer is the same whether the account exists or
 * not, so the screen never reveals which emails are registered.
 */
@Component({
  selector: 'app-recover-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, AuthFrameComponent],
  templateUrl: './recover-password.page.html',
  styleUrl: './recover-password.page.scss',
})
export class RecoverPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });
  protected readonly pending = signal(false);
  protected readonly sent = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.auth.requestPasswordReset(this.form.getRawValue().email.trim()), {
        defaultValue: undefined,
      });
      this.sent.set(true);
    } catch (error) {
      this.errorMessage.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  protected useAnotherEmail(): void {
    this.form.reset();
    this.sent.set(false);
  }
}
