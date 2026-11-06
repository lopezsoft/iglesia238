import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeatureChipComponent } from '../../../shared/ui/feature-chip.component';
import { BrandMarkComponent } from '../../../shared/ui/brand-mark.component';
import { ShowcaseCardComponent } from '../../../shared/ui/showcase-card.component';

/**
 * Brand side of the split auth screens: gradient with a faint grid, the mark, the headline,
 * decorative showcase cards (no figures) and the capability chips.
 */
@Component({
  selector: 'app-auth-brand-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandMarkComponent, ShowcaseCardComponent, FeatureChipComponent],
  styleUrl: './auth-brand-panel.component.scss',
  template: `
    <div class="brand">
      <span class="brand__mark"><app-brand-mark [size]="48" /></span>
      <span class="brand__name">Iglesia <span class="brand__accent">238</span></span>
    </div>

    <h2 class="headline">
      Gestiona
      <span class="headline__accent">la vida de tu iglesia</span>
      en un solo lugar.
    </h2>
    <p class="lead">
      Controla membresía, secretaría, aportes y contabilidad de cada sede sin cambiar de sistema.
    </p>

    <div class="showcase" aria-hidden="true">
      <app-showcase-card
        class="showcase__chart"
        title="Aportes de la semana"
        caption="Seguimiento por sede y por tipo"
        icon="coins"
        [trend]="trend"
      />
      <app-showcase-card
        class="showcase__request"
        title="Solicitud de membresía"
        caption="En revisión"
        icon="inbox"
      />
      <app-showcase-card
        class="showcase__member"
        title="Nuevo miembro registrado"
        caption="Con trazabilidad completa"
        icon="user-plus"
      />
    </div>

    <ul class="chips" aria-label="Módulos del sistema">
      <li><app-feature-chip label="Membresía" icon="id-card" /></li>
      <li><app-feature-chip label="Secretaría" icon="book" /></li>
      <li><app-feature-chip label="Aportes y diezmos" icon="coins" /></li>
      <li><app-feature-chip label="Contabilidad" icon="pie-chart" /></li>
      <li><app-feature-chip label="Auditoría" icon="shield" /></li>
    </ul>
  `,
})
export class AuthBrandPanelComponent {
  /** Shape of the illustrative line of the first card (relative heights, not data). */
  protected readonly trend = [2, 3, 3, 5, 4, 6, 5, 8];
}
