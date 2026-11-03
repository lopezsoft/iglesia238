import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { environment } from '../../environments/environment';
import { IconComponent } from '../shared/ui/icon.component';

/** Layout of the pages that need no account: membership form and status check. */
@Component({
  selector: 'app-public-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, IconComponent],
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .public-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: $space-3;
      min-height: $topbar-height;
      padding: $space-2 $space-5;
      background: $color-surface;
      border-bottom: 1px solid $color-border;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: $space-3;
      color: $color-ink;
      font-size: $font-size-md;
      font-weight: $font-weight-extrabold;
      letter-spacing: -0.02em;
      text-decoration: none;
    }

    .brand__mark {
      @include icon-chip(2.5rem);
      --tone-soft: #{$color-primary-soft};
      --tone-fg: #{$color-brand-mark};
    }

    .brand__accent {
      color: $color-primary;
    }

    main {
      flex: 1;
      width: 100%;
      max-width: 60rem;
      margin: 0 auto;
      padding: $space-6 $space-4 $space-7;
    }

    .public-footer {
      padding: $space-4 $space-5;
      color: $color-ink-subtle;
      font-size: $font-size-2xs;
      text-align: center;
    }
  `,
  template: `
    <header class="public-header">
      <a class="brand" routerLink="/apply">
        <span class="brand__mark"><app-icon name="church" [size]="22" /></span>
        <span>Iglesia <span class="brand__accent">238</span></span>
      </a>
      <nav class="cluster" aria-label="Enlaces públicos">
        <a class="link-strong" routerLink="/apply/status">Consultar mi solicitud</a>
        <a class="btn btn--secondary btn--compact btn--pill" routerLink="/login">Ingresar</a>
      </nav>
    </header>
    <main id="main-content">
      <router-outlet />
    </main>
    <footer class="public-footer">
      © {{ year }} Iglesia 238 · v{{ version }} · Tus datos se tratan conforme a la Ley 1581 de 2012.
    </footer>
  `,
})
export class PublicLayoutComponent {
  protected readonly year = new Date().getFullYear();
  protected readonly version = environment.appVersion;
}
