import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  SegmentOption,
  SegmentedControlComponent,
} from '../../../../shared/ui/segmented-control.component';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import {
  CARD_EXPIRY_WARNING_DAYS,
  CARD_STATUS_LABELS,
  CardListItem,
  CardStatus,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CardIssueDialogComponent } from './card-issue-dialog.component';
import { VoidDialogComponent } from './void-dialog.component';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_TONES: Readonly<Record<CardStatus, BadgeTone>> = {
  VALID: 'success',
  EXPIRED: 'warning',
  VOIDED: 'danger',
};

/** "all" is the filter without a status; the server only knows the three card states. */
const FILTERS: readonly SegmentOption[] = [
  { value: 'all', label: 'Todos' },
  { value: 'VALID', label: 'Vigentes' },
  { value: 'EXPIRED', label: 'Vencidos' },
  { value: 'VOIDED', label: 'Anulados' },
];

/** Membership cards of the scope: validity computed by the server, issue, PDF and void. */
@Component({
  selector: 'app-membership-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IconComponent,
    SegmentedControlComponent,
    StatusBadgeComponent,
    LoadingComponent,
    ErrorBannerComponent,
    EmptyStateComponent,
    PaginationComponent,
    CardIssueDialogComponent,
    VoidDialogComponent,
  ],
  templateUrl: './membership-cards.component.html',
  styleUrl: './membership-cards.component.scss',
})
export class MembershipCardsComponent {
  /** Today of the server, or null while it loads (issuing disabled). */
  readonly today = input<string | null>(null);
  readonly changed = output<void>();

  private readonly repo = inject(CertificatesRepository);
  private readonly auth = inject(AuthService);
  private readonly files = inject(FileDownloadService);

  protected readonly statusLabels = CARD_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;
  protected readonly warningDays = CARD_EXPIRY_WARNING_DAYS;
  protected readonly filters = FILTERS;
  protected readonly hasSede = computed(() => this.auth.tenant().congregationId !== null);
  protected readonly canIssue = computed(
    () => this.auth.can('certificates.issue') && this.hasSede(),
  );
  protected readonly status = signal('all');
  protected readonly expiringSoon = signal(false);
  protected readonly search = signal('');
  protected readonly page = signal(1);
  private readonly reloadKey = signal(0);

  private readonly query = toSignal(
    toObservable(this.search).pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
    { initialValue: '' },
  );

  protected readonly cards = rxResource({
    params: () => ({
      status: this.status() === 'all' ? null : (this.status() as CardStatus),
      q: this.query().trim() || null,
      expiringInDays: this.expiringSoon() ? CARD_EXPIRY_WARNING_DAYS : null,
      page: this.page(),
      pageSize: PAGE_SIZE,
      tenant: this.auth.tenant(),
      reloadKey: this.reloadKey(),
    }),
    stream: ({ params }) => this.repo.listCards(params),
  });
  protected readonly loadError = computed(() => userMessage(this.cards.error()));
  protected readonly hasFilters = computed(
    () => this.status() !== 'all' || this.expiringSoon() || this.search().trim() !== '',
  );

  protected readonly issueOpen = signal(false);
  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<CardListItem | null>(null);
  protected readonly voidPending = signal(false);
  protected readonly voidError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly downloadingId = signal<number | null>(null);

  protected readonly voidSubject = computed(() => {
    const target = this.voidTarget();
    return target ? `Carné ${target.cardNumber} · ${target.memberName}` : '';
  });

  protected setStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
  }

  protected toggleExpiring(): void {
    this.expiringSoon.update((value) => !value);
    this.page.set(1);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.status.set('all');
    this.expiringSoon.set(false);
    this.search.set('');
    this.page.set(1);
  }

  protected onIssued(card: CardListItem): void {
    this.message.set(
      `Carné ${card.cardNumber} emitido para ${card.memberName}, vigente hasta el ${formatDate(card.expiresOn)}.`,
    );
    this.refresh();
  }

  protected askVoid(card: CardListItem): void {
    this.voidTarget.set(card);
    this.voidError.set(null);
    this.voidOpen.set(true);
  }

  protected async downloadPdf(card: CardListItem): Promise<void> {
    this.downloadError.set(null);
    this.downloadingId.set(card.id);
    try {
      this.files.save(
        await firstValueFrom(this.repo.cardPdf(card.id)),
        `carne-${card.cardNumber}.pdf`,
      );
    } catch (error) {
      this.downloadError.set(userMessage(error));
    } finally {
      this.downloadingId.set(null);
    }
  }

  protected async confirmVoid(reason: string): Promise<void> {
    const target = this.voidTarget();
    if (!target) {
      return;
    }
    this.voidPending.set(true);
    this.voidError.set(null);
    try {
      const card = await firstValueFrom(this.repo.voidCard({ id: target.id, reason }));
      this.voidOpen.set(false);
      this.message.set(`El carné ${card.cardNumber} quedó anulado. Ya puedes emitir uno nuevo.`);
      this.refresh();
    } catch (error) {
      this.voidError.set(userMessage(error));
    } finally {
      this.voidPending.set(false);
    }
  }

  private refresh(): void {
    this.reloadKey.update((value) => value + 1);
    this.changed.emit();
  }
}

/** dd/MM/yyyy from an ISO date, for status messages built in code. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
