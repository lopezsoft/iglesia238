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
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { CertificateIssueComponent } from './components/certificate-issue.component';
import { CertificatesTableComponent } from './components/certificates-table.component';
import { MembershipCardsComponent } from './components/membership-cards.component';
import { sedeReference } from './data/certificate-document';
import { CARD_EXPIRY_WARNING_DAYS } from './data/certificates.models';
import { CertificatesRepository } from './data/certificates.repository';

type Tab = 'certificates' | 'cards';

const TABS: readonly TabCardItem<Tab>[] = [
  {
    id: 'certificates',
    title: 'Certificados',
    subtitle: 'Emisión, consulta y anulación',
    icon: 'certificate',
  },
  { id: 'cards', title: 'Carnés de miembro', subtitle: 'Vigencia y renovación', icon: 'id-card' },
];

/** D-01 / D-02: certificates with gap-free numbering and membership cards of the active sede. */
@Component({
  selector: 'app-certificates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    PageHeaderComponent,
    StatCardComponent,
    TabCardsComponent,
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

  protected readonly tabs = TABS;
  protected readonly tab = signal<string>('certificates');
  protected readonly reloadKey = signal(0);
  /** The general permission, or the one of the treasury (donations certificate only). */
  protected readonly canIssue = computed(
    () => this.auth.can('certificates.issue') || this.auth.can('donation-certificates.issue'),
  );
  /** The treasury: no membership cards, and the figures are those of the donations certificate. */
  protected readonly donationsOnly = computed(
    () => !this.auth.can('certificates.issue') && this.auth.can('donation-certificates.issue'),
  );
  protected readonly canReadMembers = computed(() => this.auth.can('members.read'));
  protected readonly hasSede = computed(() => this.auth.tenant().congregationId !== null);
  protected readonly scopeLabel = computed(() => this.auth.activeScope()?.label ?? '');
  protected readonly description = computed(() => {
    const sede = this.hasSede() ? sedeReference(this.scopeLabel()) : 'cada sede';
    if (this.donationsOnly()) {
      return `Emite el certificado de donaciones de los miembros de ${sede}: suma los aportes vigentes de un año para su declaración de renta.`;
    }
    return `Emite certificados con numeración consecutiva y controla la vigencia de los carnés de ${sede}.`;
  });

  /** Signers, letterhead and next numbers: only meaningful inside a sede. */
  protected readonly context = rxResource({
    params: () => (this.hasSede() ? { tenant: this.auth.tenant() } : undefined),
    stream: () => this.repo.issuingContext(),
  });
  protected readonly contextError = computed(() => userMessage(this.context.error()));
  /** value() throws while a resource is in error state: read it only through hasValue(). */
  protected readonly issuingContext = computed(() =>
    this.context.hasValue() ? this.context.value() : null,
  );

  /** Types of the denomination for the list filter; they do not need a sede. */
  protected readonly typesResource = rxResource({
    params: () => ({ tenant: this.auth.tenant() }),
    stream: () => this.repo.types(),
  });
  protected readonly types = computed(() =>
    this.typesResource.hasValue() ? this.typesResource.value() : [],
  );

  protected readonly summary = rxResource({
    params: () => ({ tenant: this.auth.tenant(), reloadKey: this.reloadKey() }),
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
  }

  /** Something changed in a list (void, new card): the counters and the next numbers move too. */
  protected onChanged(): void {
    this.summary.reload();
  }
}
