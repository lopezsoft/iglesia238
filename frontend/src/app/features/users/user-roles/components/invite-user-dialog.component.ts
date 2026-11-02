import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { GrantContext, ManagedUser } from '../data/user-roles.models';
import { UserRolesRepository } from '../data/user-roles.repository';
import { RoleScopeFieldsComponent, createRoleScopeForm, selectedGrant } from './role-scope-fields.component';

/** "Invitar usuario": the user is created with a pending invitation and a first role. */
@Component({
  selector: 'app-invite-user-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule, RoleScopeFieldsComponent],
  template: `
    <app-dialog [(open)]="open" title="Invitar usuario">
      <form id="invite-user-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="text-muted text-small">
          Recibirá un correo para crear su contraseña. El enlace vence en 72 horas.
        </p>
        <div class="form-grid">
          <div class="field">
            <label for="invite-name">Nombre completo *</label>
            <input
              id="invite-name"
              class="input"
              type="text"
              autocomplete="off"
              placeholder="Ej.: Natalia Cárdenas"
              formControlName="displayName"
            />
            @if (form.controls.displayName.touched && form.controls.displayName.invalid) {
              <span class="field__error">Escribe el nombre completo de la persona.</span>
            }
          </div>
          <div class="field">
            <label for="invite-email">Correo electrónico *</label>
            <input
              id="invite-email"
              class="input"
              type="email"
              autocomplete="off"
              placeholder="nombre@iglesia.example"
              formControlName="email"
            />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <span class="field__error">Escribe un correo electrónico válido.</span>
            }
          </div>
        </div>
        <app-role-scope-fields [group]="form.controls.access" [context]="context()" idPrefix="invite" roleLabel="Rol inicial" />
        <p class="text-muted text-small">Puedes agregar más roles después desde el panel del usuario.</p>
        @if (error(); as message) {
          <p class="alert alert--danger" role="alert">{{ message }}</p>
        }
      </form>
      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="invite-user-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Enviando…' : 'Enviar invitación' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class InviteUserDialogComponent {
  readonly open = model(false);
  readonly context = input.required<GrantContext>();
  readonly invited = output<ManagedUser>();

  private readonly repository = inject(UserRolesRepository);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(191)]],
    access: createRoleScopeForm(this.fb),
  });
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // The dialog stays mounted between openings: start every opening with a clean form.
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const grant = selectedGrant(this.form.controls.access, this.context());
    if (this.form.invalid || !grant || this.pending()) {
      return;
    }
    const { displayName, email } = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    try {
      const user = await firstValueFrom(
        this.repository.inviteUser({
          displayName,
          email,
          role: grant.role,
          denominationId: grant.scope.denominationId,
          congregationId: grant.scope.congregationId,
        }),
      );
      this.reset();
      this.open.set(false);
      this.invited.emit(user);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    this.form.reset({ displayName: '', email: '', access: { role: '', scope: '' } });
    this.error.set(null);
  }
}
