import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { DebugService } from '../core/debug/debug.service';
import { DropdownComponent } from '../shared/ui/dropdown.component';
import { IconComponent } from '../shared/ui/icon.component';

/** Avatar and name of the signed-in user; the menu leads to the profile, the password and the exit. */
@Component({
  selector: 'app-user-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DropdownComponent, IconComponent, RouterLink],
  styleUrl: './user-menu.component.scss',
  template: `
    <app-dropdown label="Menú de usuario" align="end" triggerClass="user-trigger">
      <span dropdown-trigger class="user">
        <span class="user__who">
          <span class="user__name">{{ user()?.displayName }}</span>
          <span class="user__scope">{{ scopeLabel() }}</span>
          @if (roleNames().length > 0) {
            <span class="badge badge--info user__role">{{ roleNames().join(' · ') }}</span>
          }
        </span>
        <span class="user__avatar" aria-hidden="true">
          {{ initials() }}
          <span class="user__presence"></span>
        </span>
        <app-icon name="chevron-down" [size]="14" />
      </span>
      <div class="user-card">
        <p class="user-card__name">{{ user()?.displayName }}</p>
        <p class="user-card__email">{{ user()?.email }}</p>
      </div>
      <div class="menu-divider"></div>
      @if (verified()) {
        <a class="menu-item" role="menuitem" routerLink="/profile">
          <app-icon name="user-circle" [size]="18" />
          Mi perfil
        </a>
        <a class="menu-item" role="menuitem" routerLink="/profile/change-password">
          <app-icon name="key" [size]="18" />
          Cambiar contraseña
        </a>
        <div class="menu-divider"></div>
      }
      <button type="button" role="menuitem" class="menu-item menu-item--danger" (click)="logout()">
        <app-icon name="log-out" [size]="18" />
        Cerrar sesión
      </button>
    </app-dropdown>
  `,
})
export class UserMenuComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly debug = inject(DebugService);

  protected readonly user = this.auth.user;
  /** Profile pages are part of the app: they stay closed until the e-mail is confirmed. */
  protected readonly verified = this.auth.emailVerified;
  protected readonly roleNames = this.auth.activeRoleNames;
  protected readonly scopeLabel = computed(() => this.auth.activeScope()?.label ?? '');
  protected readonly initials = computed(() =>
    (this.user()?.displayName ?? '')
      .replace(/^Pastor(a)?\s+/, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.debug.error('Logout failed', error),
    });
  }
}
