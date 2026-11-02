import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { MoneyPipe, formatMoney } from '../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { BadgeTone, StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { BUDGET_STATUS_LABELS, BudgetStatus, BudgetType } from '../data/accounting.models';
import { BudgetLineDialogComponent } from './components/budget-line-dialog.component';
import { BudgetLinesTableComponent } from './components/budget-lines-table.component';
import { BudgetLineRow } from './data/budget.models';
import { BudgetRepository } from './data/budget.repository';

const STATUS_TONES: Readonly<Record<BudgetStatus, BadgeTone>> = {
  DRAFT: 'warning',
  APPROVED: 'success',
  CLOSED: 'neutral',
};

/** E-06 Presupuesto: fixed and committee budgets per year with the real execution. */
@Component({
  selector: 'app-budget-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BudgetLineDialogComponent,
    BudgetLinesTableComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    MoneyPipe,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    RouterLink,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './budget.page.html',
  styleUrl: './budget.page.scss',
})
export class BudgetPage {
  private readonly repository = inject(BudgetRepository);
  private readonly auth = inject(AuthService);

  protected readonly canWrite = computed(() => this.auth.can('budgets.manage'));
  protected readonly loadErrorMessage = userMessage;
  protected readonly statusLabels = BUDGET_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;

  protected readonly year = signal<number | null>(null);
  protected readonly tab = signal<BudgetType>('FIXED');

  protected readonly overview = rxResource({
    params: () => ({ tenant: this.auth.tenant(), year: this.year() }),
    stream: ({ params }) => this.repository.overview(params.year),
  });

  protected readonly data = computed(() => this.overview.value());
  protected readonly active = computed(() => {
    const data = this.data();
    return data ? (this.tab() === 'FIXED' ? data.fixed : data.committee) : undefined;
  });
  protected readonly isClosed = computed(() => this.active()?.status === 'CLOSED');
  protected readonly canEdit = computed(() => this.canWrite() && !this.isClosed() && (this.data()?.congregationScoped ?? false));

  protected readonly kpis = computed(() => {
    const view = this.active();
    const data = this.data();
    if (!view || !data) {
      return [];
    }
    const lines = view.lines.length;
    const linesHint =
      view.type === 'FIXED'
        ? `${lines} ${lines === 1 ? 'línea' : 'líneas'} por cuenta y fondo`
        : `${lines} ${lines === 1 ? 'línea' : 'líneas'} en ${view.groups.length} ${view.groups.length === 1 ? 'comité' : 'comités'}`;
    const over = view.lines.filter((l) => l.overExecuted).length;
    return [
      { label: `Presupuesto anual · ${view.type === 'FIXED' ? 'fijo' : 'comités'}`, value: formatMoney(view.totals.annual), hint: linesHint },
      { label: 'Ejecutado real', value: formatMoney(view.totals.executed), hint: 'Desde los movimientos del libro de caja' },
      { label: 'Ejecución global', value: percent(view.totals.executionPct), hint: `Esperada a la fecha: ${percent(data.expectedPct)}` },
      { label: 'Líneas sobreejecutadas', value: String(over), hint: 'Superan el 100 % del valor anual' },
    ];
  });

  protected readonly flash = signal<string | null>(null);
  protected readonly lineOpen = signal(false);
  protected readonly editing = signal<BudgetLineRow | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<BudgetLineRow | null>(null);
  protected readonly deletePending = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly percent = percent;

  protected selectYear(event: Event): void {
    this.year.set(Number((event.target as HTMLSelectElement).value));
    this.flash.set(null);
  }

  protected selectTab(tab: BudgetType): void {
    this.tab.set(tab);
  }

  protected addLine(): void {
    this.editing.set(null);
    this.lineOpen.set(true);
  }

  protected editLine(line: BudgetLineRow): void {
    this.editing.set(line);
    this.lineOpen.set(true);
  }

  protected askDelete(line: BudgetLineRow): void {
    this.deleteTarget.set(line);
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  protected onSaved(line: BudgetLineRow): void {
    const verb = this.editing() ? 'actualizada' : 'agregada';
    this.flash.set(`Línea ${verb}: ${line.accountCode} ${line.accountName} · ${line.fundName} por ${formatMoney(line.annualAmount)}.`);
    this.overview.reload();
  }

  protected async confirmDelete(): Promise<void> {
    const line = this.deleteTarget();
    if (!line || this.deletePending()) {
      return;
    }
    this.deletePending.set(true);
    this.deleteError.set(null);
    try {
      await firstValueFrom(this.repository.deleteLine(line.id));
      this.deleteOpen.set(false);
      this.flash.set(`Línea eliminada: ${line.accountCode} ${line.accountName} · ${line.fundName}.`);
      this.overview.reload();
    } catch (error) {
      this.deleteError.set(userMessage(error));
    } finally {
      this.deletePending.set(false);
    }
  }
}

/** 83.3 → "83,3 %". */
function percent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} %`;
}
