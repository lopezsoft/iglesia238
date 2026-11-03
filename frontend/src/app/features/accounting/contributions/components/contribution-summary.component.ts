import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { IconName } from '../../../../shared/ui/icon.component';
import { ChipTone } from '../../../../shared/ui/icon-chip.component';
import { StatCardComponent } from '../../../../shared/ui/stat-card.component';
import { CONTRIBUTION_CATEGORY_PLURALS, ContributionCategory } from '../../data/accounting.models';
import { CategorySummary } from '../data/contributions.models';

const CATEGORY_LOOK: Readonly<Record<ContributionCategory, { icon: IconName; tone: ChipTone }>> = {
  TITHE: { icon: 'coins', tone: 'green' },
  OFFERING: { icon: 'gift', tone: 'cyan' },
  FIRST_FRUITS: { icon: 'sparkles', tone: 'orange' },
  VOW: { icon: 'heart', tone: 'indigo' },
  OTHER: { icon: 'banknote', tone: 'slate' },
};

/** Totals of the filter per contribution category, as KPI cards. */
@Component({
  selector: 'app-contribution-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, StatCardComponent],
  template: `
    <section class="kpi-grid" aria-label="Totales por categoría">
      @for (item of summary(); track item.category) {
        <app-stat-card
          [label]="plurals[item.category]"
          [value]="item.amount | money"
          [icon]="look[item.category].icon"
          [tone]="look[item.category].tone"
          [comparison]="item.share + ' %'"
          [hint]="item.count + (item.count === 1 ? ' aporte' : ' aportes') + ' vigentes'"
        />
      }
    </section>
  `,
})
export class ContributionSummaryComponent {
  readonly summary = input.required<readonly CategorySummary[]>();
  protected readonly plurals = CONTRIBUTION_CATEGORY_PLURALS;
  protected readonly look = CATEGORY_LOOK;
}
