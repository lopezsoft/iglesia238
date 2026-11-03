import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { MoneyPipe, formatMoney } from '../../../shared/pipes/money.pipe';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { SegmentedControlComponent, SegmentOption } from '../../../shared/ui/segmented-control.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { displayDate } from '../../../shared/utils/period';
import { CashDirection } from '../data/accounting.models';
import { CashMovementsTableComponent } from './components/cash-movements-table.component';
import { ClosePeriodDialogComponent } from './components/close-period-dialog.component';
import { ConsolidateDialogComponent } from './components/consolidate-dialog.component';
import { NewMovementDialogComponent } from './components/new-movement-dialog.component';
import { ReverseMovementDialogComponent } from './components/reverse-movement-dialog.component';
import { VouchersPanelComponent } from './components/vouchers-panel.component';
import { CashBookRow, CashMovementReceipt, CashPeriodOption, ConsolidationResult } from './data/cash-book.models';
import { CashBookRepository } from './data/cash-book.repository';

type BookTab = 'book' | 'vouchers';

const PAGE_SIZE = 15;

const DIRECTION_OPTIONS: readonly SegmentOption[] = [
  { value: '', label: 'Todos' },
  { value: 'IN', label: 'Entradas' },
  { value: 'OUT', label: 'Salidas' },
];

const TABS: readonly TabCardItem[] = [
  { id: 'book', title: 'Libro de caja', subtitle: 'Movimientos por fondo y periodo', icon: 'book' },
  { id: 'vouchers', title: 'Comprobantes', subtitle: 'Recibos, ingresos y egresos', icon: 'receipt' },
];

/** E-04 Libro de caja: movements per fund and period, reversals, period closing, consolidation and vouchers. */
@Component({
  selector: 'app-cash-book-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CashMovementsTableComponent,
    ClosePeriodDialogComponent,
    ConsolidateDialogComponent,
    DatePipe,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    MoneyPipe,
    NewMovementDialogComponent,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    ReverseMovementDialogComponent,
    RouterLink,
    SectionPanelComponent,
    SegmentedControlComponent,
    StatCardComponent,
    StatusBadgeComponent,
    TabCardsComponent,
    VouchersPanelComponent,
  ],
  templateUrl: './cash-book.page.html',
  styleUrl: './cash-book.page.scss',
})
export class CashBookPage {
  private readonly repository = inject(CashBookRepository);
  private readonly auth = inject(AuthService);

  protected readonly canWrite = computed(() => this.auth.can('cash-transactions.write'));
  protected readonly loadErrorMessage = userMessage;
  protected readonly tabs = TABS;
  protected readonly directionOptions = DIRECTION_OPTIONS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly tab = signal<BookTab>('book');

  protected readonly options = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.options(),
  });
  /** `value()` throws while a resource is in error, so everything else reads this. */
  protected readonly optionsData = computed(() => (this.options.hasValue() ? this.options.value() : undefined));

  protected readonly fundId = linkedSignal<number[], number | null>({
    source: () => this.optionsData()?.funds.map((f) => f.id) ?? [],
    computation: (ids, previous) => (previous && ids.includes(previous.value ?? -1) ? previous.value : (ids[0] ?? null)),
  });

  protected readonly periodId = linkedSignal<readonly CashPeriodOption[], number | null>({
    source: () => this.optionsData()?.periods ?? [],
    computation: (periods, previous) => {
      if (previous && periods.some((p) => p.id === previous.value)) {
        return previous.value;
      }
      return (periods.find((p) => p.status === 'OPEN') ?? periods[0])?.id ?? null;
    },
  });

  // Filters of the lines. The text is applied after a pause, so each keystroke does not hit the API.
  protected readonly direction = signal<CashDirection | ''>('');
  protected readonly accountId = signal<number | null>(null);
  protected readonly searchText = signal('');
  protected readonly search = signal('');
  private readonly typedSearch = new Subject<string>();

  protected readonly page = linkedSignal<unknown, number>({
    source: () => [this.fundId(), this.periodId(), this.direction(), this.accountId(), this.search()],
    computation: () => 1,
  });

  protected readonly filtered = computed(() => this.direction() !== '' || this.accountId() !== null || this.search().trim() !== '');

  protected readonly book = rxResource({
    params: () => {
      const fundId = this.fundId();
      const periodId = this.periodId();
      return fundId !== null && periodId !== null
        ? {
            fundId,
            periodId,
            page: this.page(),
            pageSize: PAGE_SIZE,
            direction: this.direction() || undefined,
            accountId: this.accountId() ?? undefined,
            search: this.search() || undefined,
          }
        : undefined;
    },
    stream: ({ params }) => this.repository.view(params),
  });

  protected readonly flash = signal<string | null>(null);
  protected readonly newOpen = signal(false);
  protected readonly closeOpen = signal(false);
  protected readonly consolidateOpen = signal(false);
  protected readonly reverseOpen = signal(false);
  protected readonly reverseTarget = signal<CashBookRow | null>(null);

  protected readonly view = computed(() => (this.book.hasValue() ? this.book.value() : undefined));
  protected readonly isOpen = computed(() => this.view()?.period.status === 'OPEN');
  /** Newest open period other than the selected one, for the "Ir a…" shortcut. */
  protected readonly openPeriod = computed(() =>
    (this.optionsData()?.periods ?? []).find((p) => p.status === 'OPEN' && p.id !== this.periodId()),
  );
  protected readonly previousPeriodLabel = computed(() => {
    const periods = this.optionsData()?.periods ?? [];
    const index = periods.findIndex((p) => p.id === this.periodId());
    return index >= 0 ? periods[index + 1]?.label : undefined;
  });
  /** Accounts a line can be filtered by: those used for movements. */
  protected readonly accountChoices = computed(() => this.optionsData()?.accounts ?? []);

  protected readonly cards = computed(() => {
    const view = this.view();
    if (!view) {
      return [];
    }
    const today = this.optionsData()?.today ?? '';
    const finalHint =
      view.period.status === 'CLOSED' ? `Al cierre del ${displayDate(view.period.to)}` : `Al ${displayDate(today)}, periodo en curso`;
    return [
      {
        label: 'Saldo inicial',
        value: formatMoney(view.opening),
        hint: this.previousPeriodLabel() ? `Traslado del cierre de ${this.previousPeriodLabel()}` : 'Saldo de apertura del año',
        icon: 'banknote' as const,
        tone: 'slate' as const,
      },
      {
        label: 'Entradas',
        value: formatMoney(view.income),
        hint: plural(view.inCount, 'comprobante de ingreso', 'comprobantes de ingreso'),
        icon: 'trending-up' as const,
        tone: 'green' as const,
      },
      {
        label: 'Salidas',
        value: formatMoney(view.expense),
        hint: plural(view.outCount, 'comprobante de egreso', 'comprobantes de egreso'),
        icon: 'trending-down' as const,
        tone: 'red' as const,
      },
      { label: 'Saldo final', value: formatMoney(view.closing), hint: finalHint, icon: 'wallet' as const, tone: 'cyan' as const },
    ];
  });

  constructor() {
    this.typedSearch.pipe(debounceTime(350), takeUntilDestroyed()).subscribe((text) => this.search.set(text.trim()));
  }

  protected selectTab(id: string): void {
    this.tab.set(id === 'vouchers' ? 'vouchers' : 'book');
  }

  protected selectFund(event: Event): void {
    this.fundId.set(Number((event.target as HTMLSelectElement).value));
    this.flash.set(null);
  }

  protected selectPeriod(event: Event): void {
    this.periodId.set(Number((event.target as HTMLSelectElement).value));
    this.flash.set(null);
  }

  protected goToPeriod(period: CashPeriodOption): void {
    this.periodId.set(period.id);
  }

  protected setDirection(value: string): void {
    this.direction.set(value === 'IN' || value === 'OUT' ? value : '');
  }

  protected selectAccount(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.accountId.set(value > 0 ? value : null);
  }

  protected onSearch(text: string): void {
    this.searchText.set(text);
    this.typedSearch.next(text);
  }

  protected clearFilters(): void {
    this.direction.set('');
    this.accountId.set(null);
    this.searchText.set('');
    this.search.set('');
  }

  protected askReverse(row: CashBookRow): void {
    this.reverseTarget.set(row);
    this.reverseOpen.set(true);
  }

  protected onRecorded(receipt: CashMovementReceipt): void {
    this.flash.set(`Movimiento ${receipt.voucherCode} registrado en ${this.view()?.fundName ?? 'el fondo'}.`);
    this.book.reload();
  }

  protected onReversed(receipt: CashMovementReceipt): void {
    const original = this.reverseTarget()?.voucherCode ?? 'El movimiento';
    this.flash.set(`${original} reversado con ${receipt.voucherCode}.`);
    this.book.reload();
  }

  protected onClosed(period: CashPeriodOption): void {
    this.flash.set(`${period.label} quedó cerrado. Ya no admite movimientos, reversas ni consolidaciones.`);
    this.options.reload();
    this.book.reload();
  }

  protected onConsolidated(result: ConsolidationResult): void {
    this.flash.set(
      `${plural(result.count, 'aporte consolidado', 'aportes consolidados')} en ${result.voucherCode} por ${formatMoney(result.total)} (${plural(result.movements, 'movimiento', 'movimientos')}).`,
    );
    this.book.reload();
  }
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
