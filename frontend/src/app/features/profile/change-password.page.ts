import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { userMessage } from '../../core/errors/domain-error';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  newPasswordError,
  passwordsMatch,
} from '../auth/password-form';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SpinnerComponent } from '../../shared/ui/spinner.component';
import { TextFieldComponent } from '../../shared/ui/text-field.component';

/** Changes the password of the signed-in user. The API closes the user's other sessions. */
@Component({
  selector: 'app-change-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, SpinnerComponent, TextFieldComponent, PageHeaderComponent],
  styles: `
    @use 'tokens' as *;

    .change-password {
      max-width: 30rem;
    }

    .change-password__form {
      display: flex;
      flex-direction: column;
      gap: $space-4;
    }
  `,
  template: `
    <app-page-header
      title="Cambiar contraseña"
      breadcrumb="Cuenta"
      description="Por seguridad, al cambiarla cerraremos tus sesiones en otros dispositivos."
    >
      <a class="btn btn--secondary" routerLink="/profile">Volver a mi perfil</a>
    </app-page-header>

    <section class="card change-password" aria-labelledby="change-password-title">
      <h2 id="change-password-title" class="visually-hidden">Formulario de cambio de contraseña</h2>
      @if (done()) {
        <div class="alert alert--success" role="status">
          <app-icon name="check" [size]="18" />
          <p>Tu contraseña se actualizó correctamente.</p>
        </div>
      } @else {
        <form class="change-password__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <app-text-field
            label="Contraseña actual"
            type="password"
            icon="lock"
            formControlName="current"
            autocomplete="current-password"
            [required]="true"
            [error]="currentError()"
          />
          <app-text-field
            label="Nueva contraseña"
            type="password"
            icon="key"
            formControlName="password"
            autocomplete="new-password"
            [hint]="hint"
            [required]="true"
            [error]="passwordError()"
          />
          <app-text-field
            label="Repite la nueva contraseña"
            type="password"
            icon="key"
            formControlName="confirm"
            autocomplete="new-password"
            [required]="true"
            [error]="confirmError()"
          />
          @if (errorMessage(); as message) {
            <p class="alert alert--danger" role="alert">{{ message }}</p>
          }
          <div class="cluster">
            <button type="submit" class="btn btn--primary" [class.is-loading]="pending()" [disabled]="pending()">
              @if (pending()) {
                <app-spinner />
                Guardando…
              } @else {
                Cambiar contraseña
              }
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly hint = PASSWORD_HINT;
  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      current: ['', [Validators.required, Validators.maxLength(MAX_PASSWORD_LENGTH)]],
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

  protected currentError(): string | null {
    const control = this.form.controls.current;
    return control.touched && control.invalid ? 'Escribe tu contraseña actual.' : null;
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
    if (this.pending()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { current, password } = this.form.getRawValue();
    this.pending.set(true);
    this.errorMessage.set(null);
    try {
      await firstValueFrom(this.auth.changePassword(current, password), { defaultValue: undefined });
      this.form.reset();
      this.done.set(true);
    } catch (error) {
      this.errorMessage.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
