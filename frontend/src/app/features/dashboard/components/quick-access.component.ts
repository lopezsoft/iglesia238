import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { visibleNavGroups } from '../../../core/navigation/navigation';
import { IconComponent } from '../../../shared/ui/icon.component';
import { MODULE_DESCRIPTIONS } from '../data/dashboard.models';

const HOME_PATH = '/dashboard';

/** Grid of the modules the active role can open (the menu without "Inicio"). */
@Component({
  selector: 'app-quick-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink],
  styleUrl: './quick-access.component.scss',
  template: `
    <section class="card" aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" class="shortcuts__title">Accesos rápidos</h2>
      @if (items().length === 0) {
        <p class="text-muted text-small">Tu rol no habilita módulos en este alcance.</p>
      } @else {
        <ul class="shortcuts">
          @for (item of items(); track item.path) {
            <li>
              <a class="shortcuts__link" [routerLink]="item.path">
                <span class="shortcuts__icon"><app-icon [name]="item.icon" /></span>
                <span class="shortcuts__text">
                  <span class="shortcuts__label">{{ item.label }}</span>
                  @if (item.description) {
                    <span class="text-muted text-small">{{ item.description }}</span>
                  }
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class QuickAccessComponent {
  private readonly auth = inject(AuthService);

  protected readonly items = computed(() =>
    visibleNavGroups((permissions) => this.auth.canAny(permissions))
      .flatMap((group) => group.items)
      .filter((item) => item.path !== HOME_PATH)
      .map((item) => ({ ...item, description: MODULE_DESCRIPTIONS[item.path] ?? null })),
  );
}
