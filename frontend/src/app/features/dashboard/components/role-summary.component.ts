import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS } from '../../../core/auth/permission';
import { ROLE_NAMES } from '../../../core/auth/role';
import { NAV_GROUPS } from '../../../core/navigation/navigation';
import { IconComponent } from '../../../shared/ui/icon.component';

/** "Tu rol": active roles, scope, the permissions they grant and the modules left out. */
@Component({
  selector: 'app-role-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styleUrl: './role-summary.component.scss',
  template: `
    <aside class="card role" aria-labelledby="role-title">
      <header class="role__header">
        <span class="role__mark"><app-icon name="shield" /></span>
        <div>
          <h2 id="role-title">Tu rol: {{ title() }}</h2>
          @if (denominationName()) {
            <p class="text-muted text-small">{{ denominationName() }}</p>
          }
        </div>
      </header>
      <p class="text-small">
        El menú muestra solo los módulos que estos permisos habilitan. {{ scopeNote() }}
      </p>
      <ul class="role__permissions">
        @for (permission of permissions(); track permission.code) {
          <li>
            <span>{{ permission.description }}</span>
            <code class="chip chip--mono">{{ permission.code }}</code>
          </li>
        }
      </ul>
      @if (missingModules().length > 0) {
        <p class="text-muted text-small">
          Sin acceso: {{ missingModules().join(', ') }}. Pide cambios de rol a un administrador.
        </p>
      }
    </aside>
  `,
})
export class RoleSummaryComponent {
  private readonly auth = inject(AuthService);

  readonly denominationName = input<string | null>(null);

  protected readonly title = computed(() => {
    const roles = this.auth.activeRoles().map((role) => ROLE_NAMES[role]);
    return `${roles.join(' y ') || 'Sin rol'} · ${this.auth.activeScope()?.label ?? ''}`;
  });

  protected readonly scopeNote = computed(() => {
    const scope = this.auth.activeScope();
    switch (scope?.kind) {
      case 'PLATFORM':
        return 'Actúas sobre toda la plataforma.';
      case 'DENOMINATION':
        return 'Los datos cubren todas las sedes de la denominación.';
      case 'CONGREGATION':
        return `Los datos se limitan a ${scope.label}.`;
      default:
        return '';
    }
  });

  protected readonly permissions = computed(() => {
    const granted = this.auth.permissions();
    return PERMISSIONS.filter((code) => granted.has(code)).map((code) => ({
      code,
      description: PERMISSION_DESCRIPTIONS[code],
    }));
  });

  protected readonly missingModules = computed(() =>
    NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => !this.auth.canAny(item.permissions))
      .map((item) => item.label),
  );
}
