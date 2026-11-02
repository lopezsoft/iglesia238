import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { formatMoney } from '../../../shared/pipes/money.pipe';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { monthRange, yearMonthOf } from '../data/accounting-rules';
import { SettlementHistoryComponent } from './components/settlement-history.component';
import { TithePreviewComponent } from './components/tithe-preview.component';
import { VoidSettlementDialogComponent } from './components/void-settlement-dialog.component';
import { TithePreview, TitheRange, TitheSettlementRow } from './data/tithe-settlements.models';
import { TitheSettlementsRepository } from './data/tithe-settlements.repository';

interface Notice {
  readonly tone: 'success' | 'info';
  readonly title: string | null;
  readonly text: string;
}

const STEPS = ['Definir rango', 'Revisar distribución', 'Confirmar'] as const;

/** E-05 Liquidación del diezmo: range → preview of the components → confirmation; history with voiding. */
@Component({
  selector: 'app-tithe-settlements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    RouterLink,
    SettlementHistoryComponent,
    TithePreviewComponent,
    VoidSettlementDialogComponent,
  ],
  templateUrl: './tithe-settlements.page.html',
  styleUrl: './tithe-settlements.page.scss',
})
export class TitheSettlementsPage {
  private readonly repository = inject(TitheSettlementsRepository);
  private readonly auth = inject(AuthService);

  protected readonly canWrite = computed(() => this.auth.can('tithe-settlements.write'));
  protected readonly loadErrorMessage = userMessage;
  protected readonly steps = STEPS;

  protected readonly overview = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.overview(),
  });

  /** Next range after the latest issued settlement: the rest of that month, capped at today. */
  private readonly suggested = computed<TitheRange | null>(() => {
    const data = this.overview.value();
    if (!data) {
      return null;
    }
    const from = data.lastIssued ? nextDay(data.lastIssued.to) : monthRange(yearMonthOf(data.today)).from;
    const end = monthRange(yearMonthOf(from)).to;
    return { from, to: end > data.today ? data.today : end };
  });

  protected readonly from = linkedSignal(() => this.suggested()?.from ?? '');
  protected readonly to = linkedSignal(() => this.suggested()?.to ?? '');
  protected readonly preview = signal<TithePreview | null>(null);
  protected readonly rangeError = signal<string | null>(null);
  protected readonly calculating = signal(false);
  protected readonly confirming = signal(false);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly highlightId = signal<number | null>(null);
  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<TitheSettlementRow | null>(null);

  protected readonly step = computed(() => (this.preview() ? 2 : this.highlightId() !== null ? 3 : 1));

  protected onFrom(event: Event): void {
    this.from.set((event.target as HTMLInputElement).value);
    this.resetDraft();
  }

  protected onTo(event: Event): void {
    this.to.set((event.target as HTMLInputElement).value);
    this.resetDraft();
  }

  protected suggest(): void {
    const range = this.suggested();
    if (range) {
      this.from.set(range.from);
      this.to.set(range.to);
      this.resetDraft();
    }
  }

  protected async calculate(): Promise<void> {
    const range = { from: this.from(), to: this.to() };
    if (!range.from || !range.to) {
      this.rangeError.set('Indica las dos fechas del rango.');
      return;
    }
    if (range.from > range.to) {
      this.rangeError.set('La fecha «hasta» debe ser igual o posterior a la fecha «desde».');
      return;
    }
    this.calculating.set(true);
    this.resetDraft();
    this.notice.set(null);
    this.highlightId.set(null);
    try {
      this.preview.set(await firstValueFrom(this.repository.preview(range)));
    } catch (error) {
      this.rangeError.set(userMessage(error));
    } finally {
      this.calculating.set(false);
    }
  }

  protected discard(): void {
    this.resetDraft();
  }

  protected async confirm(): Promise<void> {
    const draft = this.preview();
    if (!draft || this.confirming()) {
      return;
    }
    this.confirming.set(true);
    this.confirmError.set(null);
    try {
      const row = await firstValueFrom(this.repository.confirm({ from: draft.from, to: draft.to }));
      this.preview.set(null);
      this.highlightId.set(row.id);
      this.notice.set({
        tone: 'success',
        title: `Liquidación ${row.number} confirmada`,
        text: `Rango ${day(row.coveredFrom)} – ${day(row.coveredTo)}, ${row.contributionCount} diezmos por ${formatMoney(row.grossTithe)}. Los valores por pagar quedaron registrados en el libro de caja.`,
      });
      this.overview.reload();
    } catch (error) {
      this.confirmError.set(userMessage(error));
    } finally {
      this.confirming.set(false);
    }
  }

  protected askVoid(row: TitheSettlementRow): void {
    this.voidTarget.set(row);
    this.voidOpen.set(true);
  }

  protected onVoided(row: TitheSettlementRow): void {
    this.resetDraft();
    this.highlightId.set(null);
    this.notice.set({
      tone: 'info',
      title: null,
      text: `Liquidación ${row.number} anulada. Sus diezmos quedaron disponibles para una nueva liquidación del mismo rango.`,
    });
    this.overview.reload();
  }

  private resetDraft(): void {
    this.preview.set(null);
    this.rangeError.set(null);
    this.confirmError.set(null);
  }
}

function nextDay(date: string): string {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth + 1)).toISOString().slice(0, 10);
}

function day(date: string): string {
  const [year, month, dayOfMonth] = date.split('-');
  return `${dayOfMonth}/${month}/${year}`;
}
