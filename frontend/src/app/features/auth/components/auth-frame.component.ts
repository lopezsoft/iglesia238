import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../../shared/ui/icon.component';

/**
 * Centered layout of the screens shown before signing in (no shell): the brand card with the
 * projected form, extra panels below it (`[auth-extra]`) and the legal footer.
 */
@Component({
  selector: 'app-auth-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styleUrl: './auth-frame.component.scss',
  template: `
    <div class="auth-frame">
      <main id="main-content" class="auth-frame__main">
        <section class="card auth-frame__card" [attr.aria-labelledby]="labelledBy()">
          <div class="auth-frame__brand">
            <span class="auth-frame__mark"><app-icon name="church" [size]="22" /></span>
            <div>
              <p class="auth-frame__name">Iglesia 238</p>
              <p class="text-muted text-small">Gestión de membresía y contabilidad</p>
            </div>
          </div>
          <ng-content />
        </section>
        <ng-content select="[auth-extra]" />
        <footer class="auth-frame__footer text-muted text-small">
          Tus datos se tratan conforme a la Ley 1581 de 2012.
        </footer>
      </main>
    </div>
  `,
})
export class AuthFrameComponent {
  /** Id of the page heading that names the card. */
  readonly labelledBy = input.required<string>();
}
