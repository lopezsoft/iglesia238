import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { visibleQuickActions } from '../core/navigation/navigation';
import { DropdownComponent } from '../shared/ui/dropdown.component';
import { IconComponent } from '../shared/ui/icon.component';

/** "Nuevo" button of the top bar: shortcuts to create things, filtered by the active permissions. */
@Component({
  selector: 'app-quick-create-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DropdownComponent, IconComponent, RouterLink],
  template: `
    @if (actions().length > 0) {
      <app-dropdown label="Crear nuevo" triggerClass="btn btn--primary btn--compact">
        <span dropdown-trigger class="quick-create__content">
          <app-icon name="plus" [size]="16" />
          <span class="quick-create__text">Nuevo</span>
        </span>
        <p class="menu-heading">Crear o registrar</p>
        @for (action of actions(); track action.path) {
          <a class="menu-item" role="menuitem" [routerLink]="action.path">
            <app-icon [name]="action.icon" [size]="18" />
            {{ action.label }}
          </a>
        }
      </app-dropdown>
    }
  `,
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    .quick-create__content {
      display: inline-flex;
      align-items: center;
      gap: $space-1 + 0.125rem;
    }

    @include until($breakpoint-md) {
      .quick-create__text {
        @include visually-hidden;
      }
    }
  `,
})
export class QuickCreateMenuComponent {
  private readonly auth = inject(AuthService);

  protected readonly actions = computed(() => {
    this.auth.permissions();
    return visibleQuickActions((permissions) => this.auth.canAny(permissions));
  });
}
