import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { ROLE_NAMES } from '../../../../core/auth/role';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  ADMIN_ROLES,
  GrantContext,
  ManagedUser,
  RoleAssignmentView,
  activeAssignments,
  assignmentLabel,
  hasActiveEquivalent,
  revokedAssignments,
} from '../data/user-roles.models';
import { UserRolesRepository } from '../data/user-roles.repository';
import { AssignRoleFormComponent } from './assign-role-form.component';

/** Detail of the selected user: active roles, assign form and revoked history. */
@Component({
  selector: 'app-user-role-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AssignRoleFormComponent, DatePipe, DialogComponent, IconComponent, RouterLink],
  templateUrl: './user-role-panel.component.html',
  styleUrl: './user-role-panel.component.scss',
})
export class UserRolePanelComponent {
  readonly user = input.required<ManagedUser>();
  readonly context = input.required<GrantContext>();
  readonly changed = output<string>();
  readonly closed = output<void>();

  private readonly repository = inject(UserRolesRepository);
  private readonly auth = inject(AuthService);
  protected readonly canReadAudit = computed(() => this.auth.can('audit-logs.read'));
  protected readonly roleNames = ROLE_NAMES;
  protected readonly label = assignmentLabel;

  protected readonly active = computed(() => activeAssignments(this.user()));
  protected readonly history = computed(() => revokedAssignments(this.user()));
  protected readonly activeCountText = computed(() => {
    const count = this.active().length;
    return count === 1 ? '1 rol activo' : `${count} roles activos`;
  });

  protected readonly pending = signal(false);
  protected readonly error = linkedSignal<number, string | null>({
    source: () => this.user().id,
    computation: () => null,
  });
  protected readonly revoking = signal<RoleAssignmentView | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly confirmError = signal<string | null>(null);

  protected isOwnAdminRole(assignment: RoleAssignmentView): boolean {
    return this.user().isSelf && ADMIN_ROLES.includes(assignment.role);
  }

  protected isActiveAgain(assignment: RoleAssignmentView): boolean {
    return hasActiveEquivalent(this.user(), assignment);
  }

  protected askRevoke(assignment: RoleAssignmentView): void {
    this.revoking.set(assignment);
    this.confirmError.set(null);
    this.confirmOpen.set(true);
  }

  protected async confirmRevoke(): Promise<void> {
    const assignment = this.revoking();
    if (!assignment || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.confirmError.set(null);
    try {
      await firstValueFrom(this.repository.revokeRole(assignment.id));
      this.confirmOpen.set(false);
      this.changed.emit(
        `Se revocó ${assignmentLabel(assignment)} a ${this.user().displayName}. El registro queda en el historial; el cambio aplica en su próximo inicio de sesión.`,
      );
    } catch (error) {
      this.confirmError.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  protected async regrant(assignment: RoleAssignmentView): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.repository.grantRole({
          userId: this.user().id,
          role: assignment.role,
          denominationId: assignment.denominationId,
          congregationId: assignment.congregationId,
        }),
      );
      this.changed.emit(
        `Se otorgó de nuevo ${assignmentLabel(assignment)} a ${this.user().displayName}. Los cambios aplican en su próximo inicio de sesión.`,
      );
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
