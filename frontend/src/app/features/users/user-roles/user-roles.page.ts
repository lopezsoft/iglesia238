import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_NAMES, RoleCode } from '../../../core/auth/role';
import { userMessage } from '../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { paginate } from '../../../shared/utils/pagination';
import { InviteUserDialogComponent } from './components/invite-user-dialog.component';
import { UserRolePanelComponent } from './components/user-role-panel.component';
import { UserTableComponent } from './components/user-table.component';
import { ManagedUser, filterUsers } from './data/user-roles.models';
import { UserRolesRepository } from './data/user-roles.repository';

const PAGE_SIZE = 20;

/** A-04 Usuarios y roles: master (users table) / detail (roles of the selected user). */
@Component({
  selector: 'app-user-roles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    InviteUserDialogComponent,
    LoadingComponent,
    PageHeaderComponent,
    PaginationComponent,
    RouterLink,
    UserRolePanelComponent,
    UserTableComponent,
  ],
  templateUrl: './user-roles.page.html',
  styleUrl: './user-roles.page.scss',
})
export class UserRolesPage {
  private readonly repository = inject(UserRolesRepository);
  private readonly auth = inject(AuthService);

  protected readonly users = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () => this.repository.listUsers(),
  });
  protected readonly context = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () => this.repository.grantContext(),
  });

  protected readonly roleNames = ROLE_NAMES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly canReadAudit = computed(() => this.auth.can('audit-logs.read'));
  protected readonly search = signal('');
  protected readonly roleFilter = signal<RoleCode | ''>('');
  protected readonly page = signal(1);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly inviteOpen = signal(false);

  protected readonly loadError = computed(() => {
    const error = this.users.error() ?? this.context.error();
    return error ? userMessage(error) : null;
  });
  /**
   * Loaded values, or null while loading or after an error: `value()` throws in the error
   * state, so the template and computeds read these instead.
   */
  protected readonly userList = computed(() => (this.users.hasValue() ? this.users.value() : null));
  protected readonly grantContext = computed(() => (this.context.hasValue() ? this.context.value() : null));

  protected readonly filtered = computed(() =>
    filterUsers(this.userList() ?? [], { search: this.search(), role: this.roleFilter() }),
  );
  protected readonly pageResult = computed(() =>
    paginate(this.filtered(), { page: this.page(), pageSize: PAGE_SIZE }),
  );
  protected readonly selected = computed<ManagedUser | null>(
    () => this.userList()?.find((user) => user.id === this.selectedId()) ?? null,
  );
  protected readonly grantableRoleNames = computed(() =>
    (this.grantContext()?.roles ?? []).map((option) => ROLE_NAMES[option.role]),
  );

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  protected onRoleFilter(event: Event): void {
    this.roleFilter.set((event.target as HTMLSelectElement).value as RoleCode | '');
    this.page.set(1);
  }

  protected select(userId: number): void {
    this.selectedId.set(userId);
    this.notice.set(null);
  }

  protected onChanged(message: string): void {
    this.notice.set(message);
    this.users.reload();
  }

  protected onInvited(user: ManagedUser): void {
    this.notice.set(
      user.status === 'INVITATION_PENDING'
        ? `Invitación enviada a ${user.email}. Aparecerá como «Invitación pendiente» hasta que active su cuenta.`
        : `Rol otorgado a ${user.email}. Lo verá en su próximo inicio de sesión.`,
    );
    this.selectedId.set(user.id);
    this.users.reload();
  }

  protected retry(): void {
    this.users.reload();
    this.context.reload();
  }
}
