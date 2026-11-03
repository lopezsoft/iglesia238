import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Scope, scopeKey } from '../core/auth/session.model';
import { DropdownComponent } from '../shared/ui/dropdown.component';
import { IconComponent, IconName } from '../shared/ui/icon.component';

const KIND_ICON: Readonly<Record<Scope['kind'], IconName>> = {
  PLATFORM: 'landmark',
  DENOMINATION: 'building',
  CONGREGATION: 'church',
};

/**
 * "Actuar en" selector: the pill shows where the user is acting; with several scopes it opens a
 * menu to switch. Switching returns to the home page because the current module may not be
 * allowed in the new scope.
 */
@Component({
  selector: 'app-scope-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DropdownComponent, IconComponent],
  styleUrl: './scope-switcher.component.scss',
  template: `
    @if (options().length > 1) {
      <app-dropdown label="Actuar en" triggerClass="scope-pill scope-pill--button">
        <span dropdown-trigger class="scope-pill__content">
          <app-icon [name]="activeIcon()" [size]="16" />
          <span class="scope-pill__text">
            <span class="scope-pill__caption">Actuar en</span>
            <span class="scope-pill__label">{{ activeScope()?.label }}</span>
          </span>
          <app-icon name="chevron-down" [size]="14" />
        </span>
        <p class="menu-heading">Actuar en</p>
        @for (option of options(); track option.key) {
          <button
            type="button"
            role="menuitemradio"
            class="menu-item"
            [attr.aria-checked]="option.key === activeKey()"
            (click)="select(option.scope)"
          >
            <app-icon [name]="option.icon" [size]="18" />
            <span class="menu-item__text">{{ option.scope.label }}</span>
            @if (option.key === activeKey()) {
              <app-icon name="check" [size]="16" />
            }
          </button>
        }
      </app-dropdown>
    } @else if (activeScope(); as scope) {
      <span class="scope-pill" [attr.title]="'Actuando en ' + scope.label">
        <span class="scope-pill__content">
          <app-icon [name]="activeIcon()" [size]="16" />
          <span class="scope-pill__label">{{ scope.label }}</span>
        </span>
      </span>
    }
  `,
})
export class ScopeSwitcherComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly activeScope = this.auth.activeScope;
  protected readonly options = computed(() =>
    (this.auth.user()?.selectableScopes ?? []).map((scope) => ({
      key: scopeKey(scope),
      scope,
      icon: KIND_ICON[scope.kind],
    })),
  );
  protected readonly activeKey = computed(() => {
    const scope = this.activeScope();
    return scope ? scopeKey(scope) : '';
  });
  protected readonly activeIcon = computed<IconName>(() => KIND_ICON[this.activeScope()?.kind ?? 'CONGREGATION']);

  protected select(scope: Scope): void {
    if (scopeKey(scope) === this.activeKey()) {
      return;
    }
    this.auth.selectScope(scope);
    void this.router.navigateByUrl('/dashboard');
  }
}
