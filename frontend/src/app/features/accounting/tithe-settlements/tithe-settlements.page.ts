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
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { SettlementDetailDialogComponent } from './components/settlement-detail-dialog.component';
import { SettlementHistoryComponent } from './components/settlement-history.component';
import { TithePreviewComponent } from './components/tithe-preview.component';
import { VoidSettlementDialogComponent } from './components/void-settlement-dialog.component';
import { percentLabel } from './data/tithe-labels';
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
    SectionPanelComponent,
    SettlementDetailDialogComponent,
    SettlementHistoryComponent,
    StatCardComponent,
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
  protected readonly percent = percentLabel;

  protected readonly overview = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.overview(),
  });

  /** Next range after the latest issued settlement: the rest of that month, capped at today. */
  private readonly suggested = computed<TitheRange | null>(() => {
    const data = this.overview.hasValue() ? this.overview.value() : undefined;
    if (!data) {
      return null;
    }
    const from = data.lastIssued ? nextDay(data.lastIssued.to) : `${data.today.slice(0, 7)}-01`;
    const end = endOfMonth(from);
    return { from, to: end > data.today ? data.today : end };
  });

  protected readonly summaryCards = computed(() => {
    const summary = this.overview.hasValue() ? this.overview.value().yearSummary : null;
    if (!summary) {
      return [];
    }
    return [
      {
        key: 'count',
        icon: 'receipt' as const,
        tone: 'green' as const,
        label: `Liquidaciones ${summary.year}`,
        value: String(summary.issuedCount),
        hint: 'Confirmadas en el año',
      },
      {
        key: 'gross',
        icon: 'coins' as const,
        tone: 'cyan' as const,
        label: 'Diezmo bruto liquidado',
        value: formatMoney(summary.grossTithe),
        hint: `Año ${summary.year}`,
      },
      {
        key: 'national',
        icon: 'landmark' as const,
        tone: 'indigo' as const,
        label: 'Participación nacional',
        value: formatMoney(summary.nationalShare),
        hint: 'Diezmo de diezmos',
      },
      {
        key: 'pastor',
        icon: 'user' as const,
        tone: 'orange' as const,
        label: 'Asignación pastoral',
        value: formatMoney(summary.pastorNet),
        hint: `Fondo local: ${formatMoney(summary.localFundShare)}`,
      },
    ];
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
  protected readonly refreshKey = signal(0);
  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<TitheSettlementRow | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly detailTarget = signal<TitheSettlementRow | null>(null);

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
        text: `Rango ${day(row.coveredFrom)} – ${day(row.coveredTo)}, ${row.contributionCount} diezmos por ${formatMoney(row.grossTithe)}. Los egresos de caja quedaron registrados en el libro de caja.`,
      });
      this.refresh();
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

  protected showDetail(row: TitheSettlementRow): void {
    this.detailTarget.set(row);
    this.detailOpen.set(true);
  }

  protected onVoided(row: TitheSettlementRow): void {
    this.resetDraft();
    this.highlightId.set(null);
    this.notice.set({
      tone: 'info',
      title: null,
      text: `Liquidación ${row.number} anulada. Sus diezmos quedaron disponibles para una nueva liquidación del mismo rango.`,
    });
    this.refresh();
  }

  private refresh(): void {
    this.overview.reload();
    this.refreshKey.update((key) => key + 1);
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

function endOfMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function day(date: string): string {
  const [year, month, dayOfMonth] = date.split('-');
  return `${dayOfMonth}/${month}/${year}`;
}
