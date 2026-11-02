import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { StatCardComponent } from '../../../../shared/ui/stat-card.component';
import { CONTRIBUTION_CATEGORY_PLURALS } from '../../data/accounting.models';
import { ContributionMonth } from '../data/contributions.models';

/** Totals of the month per contribution category. */
@Component({
  selector: 'app-contribution-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, StatCardComponent],
  template: `
    <section class="stack summary" aria-labelledby="summary-title">
      <div class="cluster summary__header">
        <h2 id="summary-title">Resumen de {{ month().label.toLowerCase() }}</h2>
        <span class="text-muted">
          Total vigente del periodo: <strong class="amount">{{ month().total | money }}</strong>
          @if (month().voidedCount > 0) {
            · {{ month().voidedCount }} {{ month().voidedCount === 1 ? 'anulado' : 'anulados' }}
          }
        </span>
      </div>
      <div class="grid-auto">
        @for (item of month().summary; track item.category) {
          <app-stat-card
            [label]="plurals[item.category]"
            [value]="item.amount | money"
            [hint]="item.count + (item.count === 1 ? ' aporte' : ' aportes') + ' · ' + item.share + ' % del total'"
          />
        }
      </div>
    </section>
  `,
  styles: `
    @use 'tokens' as *;
    .summary {
      gap: $space-3;
    }
    .summary__header {
      justify-content: space-between;
    }
  `,
})
export class ContributionSummaryComponent {
  readonly month = input.required<ContributionMonth>();
  protected readonly plurals = CONTRIBUTION_CATEGORY_PLURALS;
}
