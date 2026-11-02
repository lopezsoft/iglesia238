import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import {
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { CertificateIssueComponent } from './components/certificate-issue.component';
import { CertificatesTableComponent } from './components/certificates-table.component';
import { MembershipCardsComponent } from './components/membership-cards.component';
import { sedeReference } from './data/certificate-document';
import { CARD_EXPIRY_WARNING_DAYS } from './data/certificates.models';
import { CertificatesRepository } from './data/certificates.repository';

const TABS = ['certificates', 'cards'] as const;
type Tab = (typeof TABS)[number];

/** D-01 / D-02: certificates with gap-free numbering and membership cards of the active sede. */
@Component({
  selector: 'app-certificates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    PageHeaderComponent,
    StatCardComponent,
    LoadingComponent,
    ErrorBannerComponent,
    ReadOnlyNoticeComponent,
    CertificateIssueComponent,
    CertificatesTableComponent,
    MembershipCardsComponent,
  ],
  templateUrl: './certificates.page.html',
  styleUrl: './certificates.page.scss',
})
export class CertificatesPage {
  /** ?memberId= from the member detail: preselects the member in the issue form. */
  readonly memberId = input<string | undefined>(undefined);

  private readonly repo = inject(CertificatesRepository);
  private readonly auth = inject(AuthService);

  protected readonly tab = signal<Tab>('certificates');
  protected readonly reloadKey = signal(0);
  protected readonly canIssue = computed(() => this.auth.can('certificates.issue'));
  protected readonly canReadMembers = computed(() => this.auth.can('members.read'));
  protected readonly hasSede = computed(() => this.auth.tenant().congregationId !== null);
  protected readonly scopeLabel = computed(() => this.auth.activeScope()?.label ?? '');
  protected readonly description = computed(() => {
    const sede = this.hasSede() ? sedeReference(this.scopeLabel()) : 'cada sede';
    return `Emite certificados con numeración consecutiva y controla la vigencia de los carnés de ${sede}.`;
  });

  protected readonly context = rxResource({
    params: () => (this.hasSede() ? { tenant: this.auth.tenant() } : undefined),
    stream: () => this.repo.issuingContext(),
  });
  protected readonly contextError = computed(() => userMessage(this.context.error()));
  /** value() throws while a resource is in error state: read it only through hasValue(). */
  protected readonly issuingContext = computed(() =>
    this.context.hasValue() ? this.context.value() : null,
  );

  protected readonly summary = rxResource({
    params: () => ({ tenant: this.auth.tenant() }),
    stream: () => this.repo.summary(),
  });
  protected readonly summaryStats = computed(() =>
    this.summary.hasValue() ? this.summary.value() : null,
  );

  private readonly preselectedId = computed(() => {
    const id = Number(this.memberId());
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  protected readonly preselected = rxResource({
    params: () => {
      const memberId = this.preselectedId();
      return memberId !== null && this.hasSede()
        ? { memberId, tenant: this.auth.tenant() }
        : undefined;
    },
    stream: ({ params }) => this.repo.findMember(params.memberId),
  });
  protected readonly preselectedMember = computed(() =>
    this.preselected.hasValue() ? this.preselected.value() : null,
  );
  protected readonly preselectedError = computed(() =>
    this.preselected.error() ? userMessage(this.preselected.error()) : null,
  );

  protected readonly cardsHint = computed(() => {
    const soon = this.summaryStats()?.cardsExpiringSoon ?? 0;
    return soon === 0
      ? `Ninguno vence en los próximos ${CARD_EXPIRY_WARNING_DAYS} días`
      : `${soon} ${soon === 1 ? 'vence' : 'vencen'} en los próximos ${CARD_EXPIRY_WARNING_DAYS} días`;
  });

  protected onCertificateIssued(): void {
    this.reloadKey.update((value) => value + 1);
    this.context.reload();
    this.summary.reload();
  }

  protected onChanged(): void {
    this.summary.reload();
  }

  /** WAI-ARIA tabs: arrows, Home and End move the selection and the focus (roving tabindex). */
  protected onTabKeydown(event: KeyboardEvent): void {
    const index = TABS.indexOf(this.tab());
    const target =
      event.key === 'ArrowRight'
        ? TABS[(index + 1) % TABS.length]
        : event.key === 'ArrowLeft'
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS[TABS.length - 1]
              : null;
    if (target === null) {
      return;
    }
    event.preventDefault();
    this.tab.set(target);
    const tablist = (event.currentTarget as HTMLElement).parentElement;
    tablist?.querySelector<HTMLButtonElement>(`#tab-${target}`)?.focus();
  }
}
