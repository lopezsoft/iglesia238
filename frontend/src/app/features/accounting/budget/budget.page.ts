import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { MoneyPipe, formatMoney } from '../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../shared/ui/dialog.component';
import { ExportActionsComponent } from '../../../shared/ui/export-actions.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { BadgeTone, StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { BUDGET_STATUS_LABELS, BudgetStatus, BudgetType } from '../data/accounting.models';
import { BudgetCopyDialogComponent } from './components/budget-copy-dialog.component';
import { BudgetLineDetailDialogComponent } from './components/budget-line-detail-dialog.component';
import { BudgetLineDialogComponent } from './components/budget-line-dialog.component';
import { BudgetLinesTableComponent } from './components/budget-lines-table.component';
import { BudgetLineRow, BudgetView, CopyBudgetResult, cutoffLabel } from './data/budget.models';
import { BudgetRepository } from './data/budget.repository';
import { budgetCsv, filterLines, hasFilter, linesOfNature, totalsOf } from './data/budget-view';

const STATUS_TONES: Readonly<Record<BudgetStatus, BadgeTone>> = {
  DRAFT: 'warning',
  APPROVED: 'success',
  CLOSED: 'neutral',
};

interface StatusChange {
  readonly status: BudgetStatus;
  readonly title: string;
  readonly text: string;
  readonly confirm: string;
  readonly done: string;
}

const STATUS_CHANGES: Readonly<Record<BudgetStatus, StatusChange>> = {
  APPROVED: {
    status: 'APPROVED',
    title: 'Aprobar presupuesto',
    text: 'El presupuesto queda aprobado. Mientras no se cierre, aún puedes ajustar sus líneas.',
    confirm: 'Aprobar',
    done: 'Presupuesto aprobado.',
  },
  CLOSED: {
    status: 'CLOSED',
    title: 'Cerrar presupuesto',
    text: 'Un presupuesto cerrado es de solo lectura y no puede volver a abrirse. Los ajustes se hacen en el presupuesto del año vigente.',
    confirm: 'Cerrar presupuesto',
    done: 'Presupuesto cerrado: ahora es de solo lectura.',
  },
  DRAFT: {
    status: 'DRAFT',
    title: 'Volver a borrador',
    text: 'El presupuesto vuelve a borrador para seguir editándolo; deberás aprobarlo de nuevo.',
    confirm: 'Volver a borrador',
    done: 'El presupuesto volvió a borrador.',
  },
};

const TAB_ITEMS = (fixed: number, committee: number): readonly TabCardItem<BudgetType>[] => [
  { id: 'FIXED', title: 'Presupuesto fijo', subtitle: `${fixed} ${fixed === 1 ? 'línea' : 'líneas'}`, icon: 'wallet' },
  { id: 'COMMITTEE', title: 'Por comités', subtitle: `${committee} ${committee === 1 ? 'línea' : 'líneas'}`, icon: 'users' },
];

/** E-06 Presupuesto: fixed and committee budgets per year with the real execution of the cash book. */
@Component({
  selector: 'app-budget-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BudgetCopyDialogComponent,
    BudgetLineDetailDialogComponent,
    BudgetLineDialogComponent,
    BudgetLinesTableComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    ExportActionsComponent,
    IconComponent,
    LoadingComponent,
    MoneyPipe,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    RouterLink,
    SectionPanelComponent,
    StatCardComponent,
    StatusBadgeComponent,
    TabCardsComponent,
  ],
  templateUrl: './budget.page.html',
  styleUrl: './budget.page.scss',
})
export class BudgetPage {
  private readonly repository = inject(BudgetRepository);
  private readonly auth = inject(AuthService);
  private readonly downloads = inject(FileDownloadService);

  protected readonly canWrite = computed(() => this.auth.can('budgets.manage'));
  protected readonly loadErrorMessage = userMessage;
  protected readonly statusLabels = BUDGET_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;
  protected readonly cutoff = cutoffLabel;

  protected readonly year = signal<number | null>(null);
  protected readonly tab = signal<BudgetType>('FIXED');
  protected readonly search = signal('');
  protected readonly onlyOver = signal(false);

  protected readonly overview = rxResource({
    params: () => ({ tenant: this.auth.tenant(), year: this.year() }),
    stream: ({ params }) => this.repository.overview(params.year),
  });

  protected readonly data = computed(() => (this.overview.hasValue() ? this.overview.value() : undefined));
  protected readonly active = computed<BudgetView | undefined>(() => {
    const data = this.data();
    return data ? (this.tab() === 'FIXED' ? data.fixed : data.committee) : undefined;
  });
  protected readonly tabs = computed(() => {
    const data = this.data();
    return TAB_ITEMS(data?.fixed.lines.length ?? 0, data?.committee.lines.length ?? 0);
  });
  protected readonly isClosed = computed(() => this.active()?.status === 'CLOSED');
  protected readonly canEdit = computed(() => this.canWrite() && !this.isClosed() && (this.data()?.congregationScoped ?? false));

  private readonly filter = computed(() => ({ search: this.search(), onlyOverExecuted: this.onlyOver() }));
  protected readonly filtering = computed(() => hasFilter(this.filter()));
  protected readonly visibleLines = computed(() => filterLines(this.active()?.lines ?? [], this.filter()));
  protected readonly incomeLines = computed(() => linesOfNature(this.visibleLines(), 'INCOME'));
  protected readonly expenseLines = computed(() => linesOfNature(this.visibleLines(), 'EXPENSE'));
  protected readonly incomeTotals = computed(() => totalsOf(this.incomeLines()));
  protected readonly expenseTotals = computed(() => totalsOf(this.expenseLines()));
  protected readonly visibleGroups = computed(() =>
    (this.active()?.groups ?? [])
      .map((group) => {
        const lines = filterLines(group.lines, this.filter());
        return { ...group, lines, totals: totalsOf(lines) };
      })
      .filter((group) => group.lines.length > 0),
  );
  protected readonly visibleTotals = computed(() => totalsOf(this.visibleLines()));

  protected readonly kpis = computed(() => {
    const view = this.active();
    const data = this.data();
    if (!view || !data) {
      return [];
    }
    const over = view.lines.filter((line) => line.overExecuted).length;
    return [
      {
        label: 'Ingresos presupuestados',
        value: formatMoney(view.incomeTotals.annual),
        hint: `Recaudado ${formatMoney(view.incomeTotals.executed)} · ${percent(view.incomeTotals.executionPct)}`,
        icon: 'trending-up' as const,
        tone: 'green' as const,
      },
      {
        label: 'Egresos presupuestados',
        value: formatMoney(view.expenseTotals.annual),
        hint: `Gastado ${formatMoney(view.expenseTotals.executed)}`,
        icon: 'trending-down' as const,
        tone: 'orange' as const,
      },
      {
        label: 'Ejecución de egresos',
        value: percent(view.expenseTotals.executionPct),
        hint: `Esperada a la fecha: ${percent(data.expectedPct)}`,
        icon: 'activity' as const,
        tone: 'cyan' as const,
      },
      {
        label: 'Líneas sobreejecutadas',
        value: String(over),
        hint: 'Superan el 100 % del valor anual',
        icon: 'alert' as const,
        tone: over > 0 ? ('red' as const) : ('slate' as const),
      },
    ];
  });

  protected readonly flash = signal<string | null>(null);
  protected readonly lineOpen = signal(false);
  protected readonly editing = signal<BudgetLineRow | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly detailTarget = signal<BudgetLineRow | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<BudgetLineRow | null>(null);
  protected readonly deletePending = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly copyOpen = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly statusChange = signal<StatusChange | null>(null);
  protected readonly statusPending = signal(false);
  protected readonly statusError = signal<string | null>(null);
  protected readonly ratePending = signal(false);
  protected readonly rateError = signal<string | null>(null);
  protected readonly rateDraft = signal<string | null>(null);

  protected readonly percent = percent;

  protected selectYear(event: Event): void {
    this.year.set(Number((event.target as HTMLSelectElement).value));
    this.flash.set(null);
  }

  protected selectTab(tab: string): void {
    this.tab.set(tab === 'COMMITTEE' ? 'COMMITTEE' : 'FIXED');
    this.rateDraft.set(null);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected toggleOver(event: Event): void {
    this.onlyOver.set((event.target as HTMLInputElement).checked);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.onlyOver.set(false);
  }

  protected addLine(): void {
    this.editing.set(null);
    this.lineOpen.set(true);
  }

  protected editLine(line: BudgetLineRow): void {
    this.editing.set(line);
    this.lineOpen.set(true);
  }

  protected showDetail(line: BudgetLineRow): void {
    this.detailTarget.set(line);
    this.detailOpen.set(true);
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

  protected onCopied(result: CopyBudgetResult): void {
    this.flash.set(
      `Se copiaron ${result.copied} ${result.copied === 1 ? 'línea' : 'líneas'}` +
        (result.skipped > 0 ? ` y se omitieron ${result.skipped} (ya existían o su cuenta o fondo está inactivo).` : '.'),
    );
    this.overview.reload();
  }

  protected askStatus(status: BudgetStatus): void {
    this.statusChange.set(STATUS_CHANGES[status]);
    this.statusError.set(null);
    this.statusOpen.set(true);
  }

  protected async confirmStatus(): Promise<void> {
    const change = this.statusChange();
    const budgetId = this.active()?.budgetId;
    if (!change || budgetId === null || budgetId === undefined || this.statusPending()) {
      return;
    }
    this.statusPending.set(true);
    this.statusError.set(null);
    try {
      await firstValueFrom(this.repository.changeStatus(budgetId, change.status));
      this.statusOpen.set(false);
      this.flash.set(change.done);
      this.overview.reload();
    } catch (error) {
      this.statusError.set(userMessage(error));
    } finally {
      this.statusPending.set(false);
    }
  }

  protected onRateInput(event: Event): void {
    this.rateDraft.set((event.target as HTMLInputElement).value);
    this.rateError.set(null);
  }

  /** Percentage typed by the person (5 or 5,5) → fraction for the API; null clears the rate. */
  protected async saveRate(): Promise<void> {
    const budgetId = this.active()?.budgetId;
    const draft = this.rateDraft();
    if (budgetId === null || budgetId === undefined || draft === null || this.ratePending()) {
      return;
    }
    const text = draft.trim().replace(',', '.');
    const rate = text === '' ? null : Number(text) / 100;
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 1)) {
      this.rateError.set('Ingresa un porcentaje entre 0 y 100.');
      return;
    }
    this.ratePending.set(true);
    this.rateError.set(null);
    try {
      await firstValueFrom(this.repository.setIncomeIncreaseRate(budgetId, rate === null ? null : Math.round(rate * 10_000) / 10_000));
      this.rateDraft.set(null);
      this.flash.set(rate === null ? 'Se quitó el incremento esperado de ingresos.' : 'Incremento esperado de ingresos actualizado.');
      this.overview.reload();
    } catch (error) {
      this.rateError.set(userMessage(error));
    } finally {
      this.ratePending.set(false);
    }
  }

  protected rateValue(view: BudgetView): string {
    return this.rateDraft() ?? (view.incomeIncreaseRate === null ? '' : String(Math.round(view.incomeIncreaseRate * 10_000) / 100).replace('.', ','));
  }

  protected exportCsv(): void {
    const view = this.active();
    const data = this.data();
    if (!view || !data) {
      return;
    }
    const kind = this.tab() === 'FIXED' ? 'fijo' : 'comites';
    const csv = budgetCsv(view, data.year, this.tab() === 'FIXED' ? 'Fondo' : 'Comité');
    this.downloads.save(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `presupuesto-${kind}-${data.year}.csv`);
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
