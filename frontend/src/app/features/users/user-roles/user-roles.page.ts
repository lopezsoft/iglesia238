import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PERMISSION_DESCRIPTIONS, Permission } from '../../../core/auth/permission';
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
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { SegmentedControlComponent } from '../../../shared/ui/segmented-control.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { InviteUserDialogComponent } from './components/invite-user-dialog.component';
import { OneTimeLinkDialogComponent } from './components/one-time-link-dialog.component';
import { UserRolePanelComponent } from './components/user-role-panel.component';
import { UserTableComponent } from './components/user-table.component';
import {
  InvitationResult,
  ManagedUser,
  OneTimeLink,
  USER_STATUS_OPTIONS,
  UserStatus,
} from './data/user-roles.models';
import { UserRolesRepository } from './data/user-roles.repository';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type UsersTab = 'users' | 'roles';

const TABS: readonly TabCardItem[] = [
  { id: 'users', title: 'Usuarios', subtitle: 'Cuentas, roles y enlaces de acceso', icon: 'users' },
  { id: 'roles', title: 'Roles y permisos', subtitle: 'Qué puede hacer cada rol', icon: 'shield' },
];

/** A-04 Usuarios y roles: master (users table) / detail (roles of the selected user) and the roles matrix. */
@Component({
  selector: 'app-user-roles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    InviteUserDialogComponent,
    LoadingComponent,
    OneTimeLinkDialogComponent,
    PageHeaderComponent,
    PaginationComponent,
    RouterLink,
    SectionPanelComponent,
    SegmentedControlComponent,
    StatCardComponent,
    TabCardsComponent,
    UserRolePanelComponent,
    UserTableComponent,
  ],
  templateUrl: './user-roles.page.html',
  styleUrl: './user-roles.page.scss',
})
export class UserRolesPage {
  private readonly repository = inject(UserRolesRepository);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly tabs = TABS;
  protected readonly tab = signal<UsersTab>('users');
  protected readonly statusOptions = USER_STATUS_OPTIONS;
  protected readonly roleNames = ROLE_NAMES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly canReadAudit = computed(() => this.auth.can('audit-logs.read'));

  /** What the person typed, and what is sent to the API once typing pauses. */
  protected readonly searchDraft = signal('');
  protected readonly search = signal('');
  protected readonly roleFilter = signal<RoleCode | ''>('');
  protected readonly statusFilter = signal<UserStatus | ''>('');
  protected readonly page = linkedSignal({
    source: () => ({ search: this.search(), role: this.roleFilter(), status: this.statusFilter() }),
    computation: () => 1,
  });
  protected readonly selectedId = signal<number | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly inviteOpen = signal(false);
  protected readonly issuedLink = signal<OneTimeLink | null>(null);
  protected readonly issuedFor = signal('');
  protected readonly linkOpen = signal(false);

  protected readonly users = rxResource({
    params: () => ({
      scope: this.auth.activeScope(),
      search: this.search(),
      role: this.roleFilter(),
      status: this.statusFilter(),
      page: this.page(),
    }),
    stream: ({ params }) =>
      this.repository.listUsers({
        search: params.search,
        role: params.role,
        status: params.status,
        page: params.page,
        pageSize: PAGE_SIZE,
      }),
  });
  protected readonly context = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () => this.repository.grantContext(),
  });
  /** KPI cards: each one is a one-row query, so the totals come from the server and not from the page. */
  protected readonly totals = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () => this.repository.listUsers({ search: '', role: '', status: '', page: 1, pageSize: 1 }),
  });
  protected readonly pending = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () =>
      this.repository.listUsers({ search: '', role: '', status: 'INVITATION_PENDING', page: 1, pageSize: 1 }),
  });
  protected readonly inactive = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () =>
      this.repository.listUsers({ search: '', role: '', status: 'INACTIVE', page: 1, pageSize: 1 }),
  });
  protected readonly matrix = rxResource({
    params: () => (this.tab() === 'roles' ? { scope: this.auth.activeScope() } : undefined),
    stream: () => this.repository.roleMatrix(),
  });

  protected readonly loadError = computed(() => {
    const error = this.users.error() ?? this.context.error();
    return error ? userMessage(error) : null;
  });
  /**
   * Loaded values, or null while loading or after an error: `value()` throws in the error
   * state, so the template and computeds read these instead.
   */
  protected readonly userPage = computed(() => (this.users.hasValue() ? this.users.value() : null));
  protected readonly grantContext = computed(() => (this.context.hasValue() ? this.context.value() : null));
  protected readonly roleMatrix = computed(() => (this.matrix.hasValue() ? this.matrix.value() : null));
  protected readonly totalUsers = computed(() => (this.totals.hasValue() ? this.totals.value().total : '—'));
  protected readonly pendingUsers = computed(() => (this.pending.hasValue() ? this.pending.value().total : '—'));
  protected readonly inactiveUsers = computed(() => (this.inactive.hasValue() ? this.inactive.value().total : '—'));
  protected readonly selected = computed<ManagedUser | null>(
    () => this.userPage()?.items.find((user) => user.id === this.selectedId()) ?? null,
  );
  protected readonly grantableRoleNames = computed(() =>
    (this.grantContext()?.roles ?? []).map((option) => ROLE_NAMES[option.role]),
  );

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected onTab(tab: string): void {
    this.tab.set(tab === 'roles' ? 'roles' : 'users');
  }

  protected onSearch(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.searchDraft.set(text);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search.set(text.trim()), SEARCH_DEBOUNCE_MS);
  }

  protected onRoleFilter(event: Event): void {
    this.roleFilter.set((event.target as HTMLSelectElement).value as RoleCode | '');
  }

  protected onStatusFilter(value: string): void {
    this.statusFilter.set(value as UserStatus | '');
  }

  protected select(userId: number): void {
    this.selectedId.set(userId);
    this.notice.set(null);
  }

  protected onChanged(message: string): void {
    this.notice.set(message);
    this.reloadAll();
    // A role granted or revoked can be one of the person's own: the menu and the sedes follow it.
    void this.auth.refreshSession();
  }

  protected onInvited({ user, invitation }: InvitationResult): void {
    this.selectedId.set(user.id);
    this.notice.set(
      `Invitación creada para ${user.email}. Aparecerá como «Invitación pendiente» hasta que cree su contraseña.`,
    );
    this.showLink(invitation, user.displayName);
    this.reloadAll();
  }

  protected onLinkIssued(): void {
    this.users.reload();
  }

  protected permissionLabel(code: string): string {
    return PERMISSION_DESCRIPTIONS[code as Permission] ?? code;
  }

  protected retry(): void {
    this.reloadAll();
    this.context.reload();
  }

  private showLink(link: OneTimeLink, recipient: string): void {
    this.issuedLink.set(link);
    this.issuedFor.set(recipient);
    this.linkOpen.set(true);
  }

  private reloadAll(): void {
    this.users.reload();
    this.totals.reload();
    this.pending.reload();
    this.inactive.reload();
  }
}
