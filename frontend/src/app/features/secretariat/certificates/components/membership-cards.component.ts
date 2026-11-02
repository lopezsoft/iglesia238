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
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  CARD_EXPIRY_WARNING_DAYS,
  CARD_STATUS_LABELS,
  CardFilter,
  CardListItem,
  CardStatus,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CardIssueDialogComponent } from './card-issue-dialog.component';
import { VoidDialogComponent } from './void-dialog.component';

const PAGE_SIZE = 10;

const STATUS_TONES: Readonly<Record<CardStatus, BadgeTone>> = {
  VALID: 'success',
  EXPIRED: 'warning',
  VOIDED: 'danger',
};

interface FilterOption {
  readonly value: CardFilter;
  readonly label: string;
}

/** Membership cards of the scope: validity computed from today, issue and void. */
@Component({
  selector: 'app-membership-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IconComponent,
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
  /** Today of the data source, or null when no sede is selected (issuing disabled). */
  readonly today = input<string | null>(null);
  readonly changed = output<void>();

  private readonly repo = inject(CertificatesRepository);
  private readonly auth = inject(AuthService);

  protected readonly statusLabels = CARD_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;
  protected readonly warningDays = CARD_EXPIRY_WARNING_DAYS;
  protected readonly filters: readonly FilterOption[] = [
    { value: null, label: 'Todos' },
    { value: 'VALID', label: 'Vigentes' },
    { value: 'EXPIRED', label: 'Vencidos' },
    { value: 'VOIDED', label: 'Anulados' },
  ];
  protected readonly canIssue = computed(
    () => this.auth.can('certificates.issue') && this.auth.tenant().congregationId !== null,
  );
  protected readonly status = signal<CardFilter>(null);
  protected readonly page = signal(1);
  private readonly reloadKey = signal(0);

  protected readonly cards = rxResource({
    params: () => ({
      status: this.status(),
      page: this.page(),
      pageSize: PAGE_SIZE,
      tenant: this.auth.tenant(),
      reloadKey: this.reloadKey(),
    }),
    stream: ({ params }) => this.repo.listCards(params),
  });
  protected readonly loadError = computed(() => userMessage(this.cards.error()));

  protected readonly issueOpen = signal(false);
  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<CardListItem | null>(null);
  protected readonly voidPending = signal(false);
  protected readonly voidError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly voidSubject = computed(() => {
    const target = this.voidTarget();
    return target ? `Carné ${target.cardNumber} · ${target.memberName}` : '';
  });

  protected setFilter(value: CardFilter): void {
    this.status.set(value);
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
