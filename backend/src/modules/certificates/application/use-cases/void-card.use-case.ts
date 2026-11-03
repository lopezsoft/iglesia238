import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  cardAlreadyVoided,
  cardNotFound,
  cardNotValid,
  requireVoidReason,
} from '../certificate-errors.js';
import { cardStatusOf, toCardListItem } from '../certificate-mappers.js';
import type { CardListItemView } from '../certificate.models.js';
import {
  MEMBERSHIP_CARD_REPOSITORY,
  type MembershipCardRepository,
} from '../ports/membership-card.repository.js';

/** Voids a valid card of the active sede. An expired card has nothing left to void. */
@Injectable()
export class VoidCardUseCase {
  constructor(
    @Inject(MEMBERSHIP_CARD_REPOSITORY)
    private readonly cards: MembershipCardRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: { id: number; reason: string },
    ipAddress: string | null = null,
  ): Promise<CardListItemView> {
    const scope = tenant.congregationScope();
    const existing = await this.cards.findById(scope, input.id);
    if (!existing) {
      throw cardNotFound();
    }
    const today = this.clock.today();
    const status = cardStatusOf(existing, today);
    if (status === 'VOIDED') {
      throw cardAlreadyVoided();
    }
    if (status === 'EXPIRED') {
      throw cardNotValid();
    }
    const reason = requireVoidReason(input.reason);
    const at = this.clock.now();

    await this.transactions.run(async (transaction) => {
      const done = await this.cards.markVoided(
        scope,
        existing.id,
        reason,
        at,
        transaction,
      );
      if (!done) {
        throw cardAlreadyVoided();
      }
      await this.audit.record(
        {
          action: 'MEMBERSHIP_CARD_VOIDED',
          entity: 'MembershipCard',
          entityId: existing.id,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            { status: 'VALID' },
            { status: 'VOIDED' },
            ['status'],
          ),
          ipAddress,
        },
        transaction,
      );
    });
    return toCardListItem(
      { ...existing, voidedAt: at, voidReason: reason },
      today,
    );
  }
}
