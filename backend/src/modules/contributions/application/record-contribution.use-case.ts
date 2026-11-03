import { Inject, Injectable } from '@nestjs/common';
import { VoucherTypes } from '../../../common/accounting/accounting-rules.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { DocumentNumberingService } from '../../../common/numbering/document-numbering.service.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { yearMonthOf } from '../../../common/accounting/accounting-rules.js';
import {
  validAmount,
  validNotes,
  validPastOrTodayDate,
  validReference,
} from '../../../common/accounting/input-validation.js';
import {
  assertPledgePayable,
  assertVowShape,
} from '../domain/vow-payment-rules.js';
import type { PaymentMethod } from '../domain/contribution.types.js';
import { receiptCode, toContributionRow } from './contribution-mappers.js';
import type { ContributionRow } from './contribution.models.js';
import {
  CONTRIBUTIONS_REPOSITORY,
  type ContributionsRepository,
  type LockedVowPledge,
} from './contributions.repository.js';

export interface RecordContributionCommand {
  contributionTypeId: number;
  /** Null for anonymous contributions and aggregated collections. */
  personId: number | null;
  receivedOn: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  vowPledgeId: number | null;
  notes: string | null;
  ipAddress?: string | null;
}

export const RecordErrorCode = {
  TYPE_INACTIVE: 'TYPE_INACTIVE',
  ACCOUNT_NOT_POSTABLE: 'ACCOUNT_NOT_POSTABLE',
  PERIOD_NOT_FOUND: 'PERIOD_NOT_FOUND',
  PERIOD_CLOSED: 'PERIOD_CLOSED',
  TITHE_RANGE_SETTLED: 'TITHE_RANGE_SETTLED',
  PERSON_NOT_FOUND: 'PERSON_NOT_FOUND',
} as const;

/**
 * Records a contribution and issues its receipt (REC) in one transaction. The contribution is born
 * without a cash movement: the cash book consolidates the day's contributions later.
 */
@Injectable()
export class RecordContributionUseCase {
  constructor(
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly repository: ContributionsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    private readonly numbering: DocumentNumberingService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    command: RecordContributionCommand,
  ): Promise<ContributionRow> {
    const scope = requireCongregationScope(tenant, 'registrar aportes');
    const amount = validAmount(command.amount);
    const receivedOn = validPastOrTodayDate(
      command.receivedOn,
      this.clock.today(),
      'del aporte',
    );
    const reference = validReference(
      command.paymentMethod,
      command.paymentReference,
    );
    const notes = validNotes(command.notes);

    const type = await this.repository.findType(
      scope,
      command.contributionTypeId,
    );
    if (!type || !type.isActive) {
      throw new BusinessRuleException(
        'El tipo de aporte no existe o está inactivo.',
        RecordErrorCode.TYPE_INACTIVE,
      );
    }
    if (!type.accountUsable) {
      throw new BusinessRuleException(
        'El tipo de aporte no tiene una cuenta de ingreso imputable configurada.',
        RecordErrorCode.ACCOUNT_NOT_POSTABLE,
      );
    }
    assertVowShape({
      category: type.category,
      personId: command.personId,
      vowPledgeId: command.vowPledgeId,
    });

    await this.assertPeriodOpen(scope, receivedOn);
    if (
      type.category === 'TITHE' &&
      (await this.isInsideSettledRange(scope, receivedOn))
    ) {
      // A tithe inside an issued settlement could never be settled: ranges do not overlap.
      throw new ConflictDomainException(
        'Los diezmos de esa fecha ya fueron liquidados: anula la liquidación o usa otra fecha.',
        RecordErrorCode.TITHE_RANGE_SETTLED,
      );
    }
    if (
      command.personId !== null &&
      !(await this.repository.personExists(scope, command.personId))
    ) {
      throw new NotFoundDomainException(
        'La persona no pertenece a la denominación.',
        RecordErrorCode.PERSON_NOT_FOUND,
      );
    }

    const created = await this.transactions.run(async (transaction) => {
      let pledge: LockedVowPledge | null = null;
      if (type.category === 'VOW' && command.vowPledgeId !== null) {
        pledge = await this.repository.lockVowPledge(
          scope,
          command.vowPledgeId,
          transaction,
        );
        assertPledgePayable(pledge, {
          personId: command.personId,
          contributionTypeId: type.id,
          amount,
        });
      }

      const number = await this.numbering.nextVoucherNumber(
        scope,
        VoucherTypes.receipt,
        transaction,
      );
      const voucherId = await this.repository.createVoucher(
        scope,
        { type: VoucherTypes.receipt, number, issuedOn: receivedOn },
        transaction,
      );
      const id = await this.repository.createContribution(
        scope,
        {
          contributionTypeId: type.id,
          personId: command.personId,
          vowPledgeId: pledge?.id ?? null,
          voucherId,
          receivedOn,
          amount,
          paymentMethod: command.paymentMethod,
          paymentReference: reference,
          notes,
          recordedById: tenant.userId,
        },
        transaction,
      );
      if (pledge) {
        await this.repository.refreshVowPledgeStatus(
          scope,
          pledge.id,
          transaction,
        );
      }
      await this.audit.record(
        {
          action: 'CONTRIBUTION_RECORDED',
          entity: 'Contribution',
          entityId: id,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            null,
            {
              status: 'RECORDED',
              amount,
              category: type.category,
              receipt: receiptCode(number, receivedOn),
            },
            ['status', 'amount', 'category', 'receipt'],
          ),
          ipAddress: command.ipAddress ?? null,
        },
        transaction,
      );
      return id;
    });

    const record = await this.repository.findById(scope, created);
    if (!record) {
      throw new NotFoundDomainException('El aporte no existe.');
    }
    return toContributionRow(record);
  }

  private async assertPeriodOpen(
    scope: ReturnType<typeof requireCongregationScope>,
    receivedOn: string,
  ): Promise<void> {
    const { year, month } = yearMonthOf(receivedOn);
    const period = await this.repository.findPeriod(scope, year, month);
    if (!period) {
      throw new BusinessRuleException(
        'Ese mes no tiene un periodo contable en la sede. Pide a Tesorería que lo abra en Configuración contable.',
        RecordErrorCode.PERIOD_NOT_FOUND,
      );
    }
    if (period.status !== 'OPEN') {
      throw new ConflictDomainException(
        'El periodo contable de esa fecha está cerrado: elige una fecha de un periodo abierto.',
        RecordErrorCode.PERIOD_CLOSED,
      );
    }
  }

  private async isInsideSettledRange(
    scope: ReturnType<typeof requireCongregationScope>,
    date: string,
  ): Promise<boolean> {
    const ranges = await this.repository.listIssuedTitheRanges(scope);
    return ranges.some((range) => range.from <= date && date <= range.to);
  }
}
