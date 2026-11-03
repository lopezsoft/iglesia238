import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { IconComponent } from '../../../shared/ui/icon.component';
import { FinancialReport, formatShare } from '../data/reports.models';

/** "Aportes por tipo": horizontal bars with amount, count and share. Never shows contributors. */
@Component({
  selector: 'app-contribution-types',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MoneyPipe, RouterLink],
  styleUrl: './report-section.scss',
  template: `
    <section class="card" aria-labelledby="types-title">
      <header class="card__header">
        <div>
          <h2 id="types-title" class="section-title">Aportes por tipo</h2>
          <p class="text-muted text-small">
            Aportes vigentes (sin anulados) · total {{ report().contributionsTotal | money }} ·
            {{ report().contributionsCount }} registros
          </p>
        </div>
        <div class="cluster">
          @if (canOpenContributions()) {
            <a class="btn btn--ghost btn--sm" routerLink="/accounting/contributions">Ver aportes</a>
          }
          <button type="button" class="btn btn--secondary btn--sm" (click)="exportCsv.emit()">
            <app-icon name="download" />
            Exportar CSV
          </button>
        </div>
      </header>

      @if (report().contributionTypes.length === 0) {
        <p class="text-muted">No hay aportes en el periodo seleccionado.</p>
      } @else {
        <ul class="type-bars">
          @for (type of report().contributionTypes; track type.contributionTypeId) {
            <li>
              <div class="type-bars__line">
                <span>
                  <span class="type-bars__name">{{ type.name }}</span>
                  <span class="text-muted">
                    · {{ type.count }} {{ type.count === 1 ? 'aporte' : 'aportes' }}</span
                  >
                </span>
                <span>
                  <span class="amount">{{ type.amount | money }}</span>
                  <span class="text-muted"> ({{ share(type.share) }})</span>
                </span>
              </div>
              <div class="progress" aria-hidden="true">
                <div class="progress__bar" [style.width.%]="type.share * 100"></div>
              </div>
            </li>
          }
        </ul>
      }
      <div class="section-footer text-muted text-small">
        <p>
          Otros ingresos no clasificados como aporte (actividades, donaciones externas,
          rendimientos):
          <span class="amount">{{ report().otherIncome | money }}</span
          >.
        </p>
        <p>Totales agregados: el reporte no muestra aportantes individuales.</p>
      </div>
    </section>
  `,
})
export class ContributionTypesComponent {
  readonly report = input.required<FinancialReport>();
  readonly canOpenContributions = input(false);
  readonly exportCsv = output<void>();

  protected readonly share = formatShare;
}
