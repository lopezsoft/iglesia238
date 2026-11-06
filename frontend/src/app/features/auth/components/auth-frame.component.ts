import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AuthBrandPanelComponent } from './auth-brand-panel.component';

/**
 * Split layout of the screens shown before signing in (no shell): the brand panel on the left
 * and, on the right, the projected form, extra panels below it (`[auth-extra]`) and the legal
 * footer. Below 900 px the brand panel collapses to a top band.
 */
@Component({
  selector: 'app-auth-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthBrandPanelComponent],
  styleUrl: './auth-frame.component.scss',
  template: `
    <div class="auth">
      <app-auth-brand-panel class="auth__brand" />
      <main id="main-content" class="auth__main">
        <section class="auth__content" [attr.aria-labelledby]="labelledBy()">
          <ng-content />
          <ng-content select="[auth-extra]" />
        </section>
        <footer class="auth__footer">
          <span>
            © {{ year }}
            <a href="https://lopezsoft.net.co" target="_blank" rel="noopener noreferrer">lopezsoft.net.co</a>
            · Todos los derechos reservados · v{{ version }}
          </span>
          <span>Tus datos se tratan conforme a la Ley 1581 de 2012.</span>
        </footer>
      </main>
    </div>
  `,
})
export class AuthFrameComponent {
  /** Id of the page heading that names the form section. */
  readonly labelledBy = input.required<string>();

  protected readonly year = new Date().getFullYear();
  protected readonly version = environment.appVersion;
}
