import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { IconComponent } from '../shared/ui/icon.component';

/** Layout of the pages that need no account: membership form and status check. */
@Component({
  selector: 'app-public-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, IconComponent],
  styles: `
    @use 'tokens' as *;

    .public-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: $space-3;
      padding: $space-3 $space-5;
      background: $color-surface;
      border-bottom: 1px solid $color-border;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: $space-2;
      color: $color-ink;
      font-weight: $font-weight-semibold;
      text-decoration: none;
    }

    .brand app-icon {
      color: $color-primary;
    }

    main {
      max-width: 60rem;
      margin: 0 auto;
      padding: $space-6 $space-4 $space-7;
    }
  `,
  template: `
    <header class="public-header">
      <a class="brand" routerLink="/apply">
        <app-icon name="church" [size]="22" />
        Iglesia 238
      </a>
      <nav class="cluster" aria-label="Enlaces públicos">
        <a routerLink="/apply/status">Consultar mi solicitud</a>
        <a class="btn btn--secondary btn--sm" routerLink="/login">Ingresar</a>
      </nav>
    </header>
    <main id="main-content">
      <router-outlet />
    </main>
  `,
})
export class PublicLayoutComponent {}
