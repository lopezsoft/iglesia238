import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PERMISSION_DESCRIPTIONS, Permission } from '../../core/auth/permission';
import { IconChipComponent } from '../../shared/ui/icon-chip.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

/** The signed-in user's account: identity, roles by scope and the way to change the password. */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, IconChipComponent, PageHeaderComponent],
  styleUrl: './profile.page.scss',
  template: `
    <app-page-header
      title="Mi perfil"
      breadcrumb="Cuenta"
      description="Tus datos de acceso y los roles que tienes en cada sede."
    />

    <div class="stack">
      <section class="card profile__identity" aria-labelledby="profile-identity">
        <span class="profile__avatar" aria-hidden="true">{{ initials() }}</span>
        <div>
          <h2 id="profile-identity">{{ user()?.displayName }}</h2>
          <p class="text-muted">{{ user()?.email }}</p>
        </div>
        <a class="btn btn--secondary profile__action" routerLink="/profile/change-password">
          <app-icon name="key" [size]="18" />
          Cambiar contraseña
        </a>
      </section>

      <section class="card" aria-labelledby="profile-roles">
        <header class="card__header">
          <span class="cluster">
            <app-icon-chip icon="shield" tone="indigo" />
            <h2 id="profile-roles">Roles y alcances</h2>
          </span>
        </header>
        <div class="table-wrap">
          <table class="table">
            <caption class="visually-hidden">Roles asignados a tu cuenta</caption>
            <thead>
              <tr>
                <th scope="col">Rol</th>
                <th scope="col">Dónde aplica</th>
                <th scope="col">Qué puedes hacer</th>
              </tr>
            </thead>
            <tbody>
              @for (assignment of assignments(); track $index) {
                <tr>
                  <td>
                    <span class="badge badge--info">{{ assignment.roleName }}</span>
                  </td>
                  <td>{{ assignment.scope.label }}</td>
                  <td>
                    <ul class="profile__permissions">
                      @for (permission of assignment.permissions; track permission) {
                        <li>{{ describe(permission) }}</li>
                      }
                    </ul>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.user;
  protected readonly assignments = computed(() => this.user()?.assignments ?? []);
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

  protected describe(permission: Permission): string {
    return PERMISSION_DESCRIPTIONS[permission] ?? permission;
  }
}
