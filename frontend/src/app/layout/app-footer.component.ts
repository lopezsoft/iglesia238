import { ChangeDetectionStrategy, Component } from '@angular/core';
import { environment } from '../../environments/environment';
import { CustomTooltipDirective } from '../shared/ui/custom-tooltip.directive';
import { IconComponent } from '../shared/ui/icon.component';

/** Copyright line and version pill fixed/sticky at the bottom of the authenticated layout, mirroring `.topbar`. */
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CustomTooltipDirective, IconComponent],
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    :host {
      position: sticky;
      bottom: 0;
      z-index: 8;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: $space-2 $space-4;
      min-height: $footer-height;
      padding: $space-2 $space-4;
      background: $color-surface;
      border-top: 1px solid $color-border;
      color: $color-ink-subtle;
      font-size: $font-size-2xs;

      @include from($breakpoint-md) {
        padding: $space-2 $space-5;
      }
    }

    .footer__brand {
      color: $color-ink;
      font-weight: $font-weight-semibold;
      text-decoration: none;

      &:hover {
        color: $color-primary;
        text-decoration: underline;
      }
    }

    .footer__version {
      display: inline-flex;
      align-items: center;
      gap: $space-1 + 0.125rem;
      padding: 3px $space-3;
      border: 1px solid $color-primary-soft;
      border-radius: $radius-pill;
      background: $color-surface-2;
      color: $color-primary;
      font-weight: $font-weight-bold;
    }
  `,
  template: `
    <p>
      © {{ year }}
      <a class="footer__brand" href="https://lopezsoft.net.co" target="_blank" rel="noopener noreferrer"
        >lopezsoft.net.co</a
      >
      · Todos los derechos reservados
    </p>
    <span class="footer__version" [appCustomTooltip]="'Versión ' + version">
      <app-icon name="shield-check" [size]="12" />
      Versión {{ version }}
    </span>
  `,
})
export class AppFooterComponent {
  protected readonly year = new Date().getFullYear();
  protected readonly version = environment.appVersion;
}
