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
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../../../shared/ui/feedback.components';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { MemberStatus } from '../../../../core/models/membership.model';
import { CONSENT_CHANNEL_LABELS } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

const ANONYMIZE_CONFIRMATION = 'ANONIMIZAR';

/** Authorization to process personal data (Ley 1581 de 2012). Revoking never deletes it. */
@Component({
  selector: 'app-consent-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    ReadOnlyNoticeComponent,
    StatusBadgeComponent,
  ],
  styleUrl: './member-tab.scss',
  templateUrl: './consent-tab.component.html',
})
export class ConsentTabComponent {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);

  readonly memberId = input.required<number>();
  /** Anonymizing needs a member that is not active. */
  readonly memberStatus = input.required<MemberStatus>();
  /** Emitted after the data were anonymized, so the file reloads. */
  readonly anonymizedDone = output<void>();

  protected readonly channelLabels = CONSENT_CHANNEL_LABELS;
  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  protected readonly command = new CommandState();
  protected readonly confirmOpen = signal(false);
  protected readonly acknowledged = signal(false);
  protected readonly anonymizeOpen = signal(false);
  protected readonly anonymizeConfirmation = signal('');
  protected readonly anonymized = signal(false);
  protected readonly confirmationWord = ANONYMIZE_CONFIRMATION;

  protected readonly consents = rxResource({
    params: () => ({ memberId: this.memberId() }),
    stream: ({ params }) => this.repository.consents(params.memberId),
  });

  protected readonly rows = computed(() => (this.consents.hasValue() ? this.consents.value() : []));
  /** The consent in force: the most recent one that is not revoked. */
  protected readonly active = computed(
    () => this.rows().find((row) => row.revokedAt === null) ?? null,
  );
  protected readonly latest = computed(() => this.active() ?? this.rows()[0] ?? null);
  /** Revoked and not replaced by a new consent: the personal data can now be anonymized. */
  protected readonly anonymizationPending = computed(
    () => this.active() === null && (this.rows()[0]?.revokedAt ?? null) !== null,
  );
  protected readonly canAnonymize = computed(
    () => this.canWrite() && this.anonymizationPending() && this.memberStatus() !== 'ACTIVE',
  );
  protected readonly confirmationMatches = computed(
    () => this.anonymizeConfirmation().trim().toUpperCase() === ANONYMIZE_CONFIRMATION,
  );
  protected readonly loadError = computed(() =>
    this.consents.error() ? userMessage(this.consents.error()) : null,
  );

  protected openConfirm(): void {
    this.acknowledged.set(false);
    this.command.clear();
    this.confirmOpen.set(true);
  }

  protected async revoke(): Promise<void> {
    const consent = this.active();
    if (!consent || !this.acknowledged()) {
      return;
    }
    const done = await this.command.run(
      this.repository.revokeConsent(this.memberId(), consent.id),
      'Revocación registrada. Cuando el miembro no esté activo podrás anonimizar sus datos personales.',
    );
    if (done) {
      this.confirmOpen.set(false);
      this.consents.reload();
    }
  }

  protected openAnonymize(): void {
    this.anonymizeConfirmation.set('');
    this.command.clear();
    this.anonymizeOpen.set(true);
  }

  protected async anonymize(): Promise<void> {
    if (!this.confirmationMatches()) {
      return;
    }
    const done = await this.command.run(
      this.repository.anonymize(this.memberId()),
      'Los datos personales fueron anonimizados.',
    );
    if (done) {
      this.anonymizeOpen.set(false);
      this.anonymized.set(true);
      this.consents.reload();
      this.anonymizedDone.emit();
    }
  }
}
