import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { CashMovementsTableComponent } from './components/cash-movements-table.component';
import { ClosePeriodDialogComponent } from './components/close-period-dialog.component';
import { ConsolidateDialogComponent } from './components/consolidate-dialog.component';
import { NewMovementDialogComponent } from './components/new-movement-dialog.component';
import { ReverseMovementDialogComponent } from './components/reverse-movement-dialog.component';
import { CashBookRow, CashMovementReceipt, CashPeriodOption, ConsolidationResult } from './data/cash-book.models';
import { CashBookRepository } from './data/cash-book.repository';

/** E-04 Libro de caja: movements per fund and period, reversals, period closing, consolidation. */
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
    StatCardComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './cash-book.page.html',
  styleUrl: './cash-book.page.scss',
})
export class CashBookPage {
  private readonly repository = inject(CashBookRepository);
  private readonly auth = inject(AuthService);

  protected readonly canWrite = computed(() => this.auth.can('cash-transactions.write'));
  protected readonly loadErrorMessage = userMessage;

  protected readonly options = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.options(),
  });

  protected readonly fundId = linkedSignal<number[], number | null>({
    source: () => this.options.value()?.funds.map((f) => f.id) ?? [],
    computation: (ids, previous) => (previous && ids.includes(previous.value ?? -1) ? previous.value : (ids[0] ?? null)),
  });

  protected readonly periodId = linkedSignal<readonly CashPeriodOption[], number | null>({
    source: () => this.options.value()?.periods ?? [],
    computation: (periods, previous) => {
      if (previous && periods.some((p) => p.id === previous.value)) {
        return previous.value;
      }
      return (periods.find((p) => p.status === 'OPEN') ?? periods[0])?.id ?? null;
    },
  });

  protected readonly book = rxResource({
    params: () => {
      const fundId = this.fundId();
      const periodId = this.periodId();
      return fundId !== null && periodId !== null ? { fundId, periodId } : undefined;
    },
    stream: ({ params }) => this.repository.view(params),
  });

  protected readonly flash = signal<string | null>(null);
  protected readonly newOpen = signal(false);
  protected readonly closeOpen = signal(false);
  protected readonly consolidateOpen = signal(false);
  protected readonly reverseOpen = signal(false);
  protected readonly reverseTarget = signal<CashBookRow | null>(null);

  protected readonly view = computed(() => this.book.value());
  protected readonly isOpen = computed(() => this.view()?.period.status === 'OPEN');
  /** Newest open period other than the selected one, for the "Ir a…" shortcut. */
  protected readonly openPeriod = computed(() =>
    (this.options.value()?.periods ?? []).find((p) => p.status === 'OPEN' && p.id !== this.periodId()),
  );
  protected readonly previousPeriodLabel = computed(() => {
    const periods = this.options.value()?.periods ?? [];
    const index = periods.findIndex((p) => p.id === this.periodId());
    return index >= 0 ? periods[index + 1]?.label : undefined;
  });

  protected readonly cards = computed(() => {
    const view = this.view();
    if (!view) {
      return [];
    }
    const today = this.options.value()?.today ?? '';
    const finalHint = view.period.status === 'CLOSED' ? `Al cierre del ${dayMonthYear(view.period.to)}` : `Al ${dayMonthYear(today)}, periodo en curso`;
    return [
      {
        label: 'Saldo inicial',
        value: formatMoney(view.opening),
        hint: this.previousPeriodLabel() ? `Traslado del cierre de ${this.previousPeriodLabel()}` : 'Saldo de apertura del año',
      },
      { label: 'Entradas', value: formatMoney(view.income), hint: plural(view.inCount, 'comprobante de ingreso', 'comprobantes de ingreso') },
      { label: 'Salidas', value: formatMoney(view.expense), hint: plural(view.outCount, 'comprobante de egreso', 'comprobantes de egreso') },
      { label: 'Saldo final', value: formatMoney(view.closing), hint: finalHint },
    ];
  });

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

function dayMonthYear(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
