import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ROLE_NAMES } from '../../../../core/auth/role';
import { userMessage } from '../../../../core/errors/domain-error';
import { GrantContext, ManagedUser } from '../data/user-roles.models';
import { UserRolesRepository } from '../data/user-roles.repository';
import { RoleScopeFieldsComponent, createRoleScopeForm, selectedGrant } from './role-scope-fields.component';

/** "Asignar rol" section of the user panel. */
@Component({
  selector: 'app-assign-role-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RoleScopeFieldsComponent],
  template: `
    <form class="stack assign-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <app-role-scope-fields [group]="form" [context]="context()" idPrefix="assign" />
      @if (error(); as message) {
        <p class="alert alert--danger" role="alert">{{ message }}</p>
      }
      <div>
        <button type="submit" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Asignando…' : 'Asignar rol' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .assign-form {
      gap: 0.75rem;
    }
  `,
})
export class AssignRoleFormComponent {
  readonly user = input.required<ManagedUser>();
  readonly context = input.required<GrantContext>();
  readonly granted = output<string>();

  private readonly repository = inject(UserRolesRepository);
  protected readonly form = createRoleScopeForm(inject(NonNullableFormBuilder));
  protected readonly pending = signal(false);
  protected readonly error = linkedSignal<number, string | null>({
    source: () => this.user().id,
    computation: () => null,
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const grant = selectedGrant(this.form, this.context());
    if (!grant || this.pending()) {
      return;
    }
    const user = this.user();
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.repository.grantRole({
          userId: user.id,
          role: grant.role,
          denominationId: grant.scope.denominationId,
          congregationId: grant.scope.congregationId,
        }),
      );
      this.form.reset({ role: '', scope: '' });
      this.granted.emit(
        `Se asignó ${ROLE_NAMES[grant.role]} · ${grant.scope.label} a ${user.displayName}. Los cambios aplican en su próximo inicio de sesión.`,
      );
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
