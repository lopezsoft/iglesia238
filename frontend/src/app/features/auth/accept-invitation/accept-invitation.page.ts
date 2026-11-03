import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InvitationInfo } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { DebugService } from '../../../core/debug/debug.service';
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

type InvitationState = 'checking' | 'ready' | 'invalid' | 'done';

/** Activates an invited account: validates the link (`?token=`) and lets the person choose a password. */
@Component({
  selector: 'app-accept-invitation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, SpinnerComponent, TextFieldComponent, AuthFrameComponent],
  templateUrl: './accept-invitation.page.html',
  styleUrl: '../auth-page.scss',
})
export class AcceptInvitationPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly debug = inject(DebugService);

  /** `?token=` of the invitation link. It is read once and then removed from the address. */
  readonly token = input<string | undefined>(undefined);
  private readonly linkToken = signal<string | null>(null);

  protected readonly hint = PASSWORD_HINT;
  protected readonly state = signal<InvitationState>('checking');
  protected readonly invitation = signal<InvitationInfo | null>(null);
  protected readonly invalidMessage = signal('El enlace de invitación no es válido o ya venció.');
  protected readonly signedIn = this.auth.isAuthenticated;
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
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.state.set('invalid');
      return;
    }
    this.linkToken.set(token);
    stripTokenFromUrl(this.router);
    try {
      this.invitation.set(await firstValueFrom(this.auth.getInvitation(token)));
      this.state.set('ready');
    } catch (error) {
      this.invalidMessage.set(userMessage(error));
      this.state.set('invalid');
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
      return 'Repite la contraseña.';
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
      await firstValueFrom(this.auth.acceptInvitation(token, this.form.getRawValue().password), {
        defaultValue: undefined,
      });
      this.state.set('done');
    } catch (error) {
      this.errorMessage.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  /** The login screen is closed to signed-in users: end this session first. */
  protected signOutAndContinue(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.debug.error('Logout failed', error),
    });
  }
}
