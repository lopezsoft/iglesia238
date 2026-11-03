import { ChangeDetectionStrategy, Component } from '@angular/core';
import { environment } from '../../environments/environment';
import { IconComponent } from '../shared/ui/icon.component';

/** Copyright line and version pill at the bottom of the authenticated layout. */
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    @use 'tokens' as *;

    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: $space-2 $space-4;
      padding: $space-4 $space-5;
      color: $color-ink-subtle;
      font-size: $font-size-2xs;
    }

    .footer__version {
      display: inline-flex;
      align-items: center;
      gap: $space-1 + 0.125rem;
      padding: 3px $space-3;
      border: 1px solid $color-primary-soft;
      border-radius: $radius-pill;
      background: $color-surface;
      color: $color-primary;
      font-weight: $font-weight-bold;
    }
  `,
  template: `
    <p>© {{ year }} Iglesia 238 · Todos los derechos reservados</p>
    <span class="footer__version" [attr.title]="'Versión ' + version">
      <app-icon name="shield-check" [size]="12" />
      Versión {{ version }}
    </span>
  `,
})
export class AppFooterComponent {
  protected readonly year = new Date().getFullYear();
  protected readonly version = environment.appVersion;
}
