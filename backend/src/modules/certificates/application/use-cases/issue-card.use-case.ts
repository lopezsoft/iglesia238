import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import { isIsoDate } from '../../../../common/mappers/value-mappers.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  SUPERSEDED_CARD_REASON,
  activeCardExists,
  invalidDate,
  invalidExpiry,
  memberNotActive,
  memberNotFound,
  memberNotRegistered,
} from '../certificate-errors.js';
import { cardStatusOf, toCardListItem } from '../certificate-mappers.js';
import type { CardListItemView } from '../certificate.models.js';
import {
  CERTIFICATE_MEMBER_READER,
  type CertificateMemberReader,
} from '../ports/certificate-member.reader.js';
import {
  MEMBERSHIP_CARD_REPOSITORY,
  type MembershipCardRepository,
} from '../ports/membership-card.repository.js';

export interface IssueCardInput {
  readonly memberId: number;
  readonly issuedOn: string;
  readonly expiresOn: string;
}

/**
 * Issues a membership card in the active sede. A member has one valid card per sede: the valid cards
 * of previous sedes (internal transfer) do not block a new one and are voided with it.
 */
@Injectable()
export class IssueCardUseCase {
  constructor(
    @Inject(MEMBERSHIP_CARD_REPOSITORY)
    private readonly cards: MembershipCardRepository,
    @Inject(CERTIFICATE_MEMBER_READER)
    private readonly members: CertificateMemberReader,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: IssueCardInput,
    ipAddress: string | null = null,
  ): Promise<CardListItemView> {
    const scope = tenant.congregationScope();
    const congregationId = scope.requireCongregationId();
    const today = this.clock.today();

    if (!isIsoDate(input.issuedOn) || !isIsoDate(input.expiresOn)) {
      throw invalidDate('Las fechas de emisión y vencimiento no son válidas.');
    }
    if (input.expiresOn <= input.issuedOn) {
      throw invalidExpiry();
    }
    if (input.issuedOn > today) {
      throw invalidDate('La fecha de emisión no puede ser futura.');
    }
    if (input.expiresOn < today) {
      throw invalidDate('El carné no puede emitirse ya vencido.');
    }

    const member = await this.members.findMember(scope, input.memberId);
    if (!member) {
      throw memberNotFound();
    }
    if (member.status !== 'ACTIVE') {
      throw memberNotActive();
    }
    if (member.memberNumber === null) {
      throw memberNotRegistered();
    }
    const memberNumber = member.memberNumber;

    const existing = await this.cards.findByMember(scope, member.id);
    const valid = existing.filter(
      (card) => cardStatusOf(card, today) === 'VALID',
    );
    if (valid.some((card) => card.congregationId === congregationId)) {
      throw activeCardExists();
    }
    const previousSedes = valid.filter(
      (card) => card.congregationId !== congregationId,
    );
    const at = this.clock.now();

    const saved = await this.transactions.run(async (transaction) => {
      for (const previous of previousSedes) {
        await this.cards.markVoided(
          scope.forCongregation(previous.congregationId),
          previous.id,
          SUPERSEDED_CARD_REASON,
          at,
          transaction,
        );
        await this.audit.record(
          {
            action: 'MEMBERSHIP_CARD_VOIDED',
            entity: 'MembershipCard',
            entityId: previous.id,
            actor: tenant,
            congregationId: previous.congregationId,
            changes: buildAuditChanges(
              { status: 'VALID' },
              { status: 'VOIDED' },
              ['status'],
            ),
            ipAddress,
          },
          transaction,
        );
      }
      const card = await this.cards.insert(
        scope,
        {
          memberId: member.id,
          memberNumber,
          issuedOn: input.issuedOn,
          expiresOn: input.expiresOn,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'MEMBERSHIP_CARD_ISSUED',
          entity: 'MembershipCard',
          entityId: card.id,
          actor: tenant,
          congregationId,
          changes: buildAuditChanges(null, { expiresOn: card.expiresOn }, [
            'expiresOn',
          ]),
          ipAddress,
        },
        transaction,
      );
      return card;
    });
    return toCardListItem(saved, today);
  }
}
