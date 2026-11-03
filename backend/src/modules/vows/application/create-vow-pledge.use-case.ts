import { Inject, Injectable } from '@nestjs/common';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  validAmount,
  validNotes,
  validPastOrTodayDate,
} from '../../../common/accounting/input-validation.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  BusinessRuleException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { toVowPledgeRow } from './vow-pledge-mappers.js';
import type { VowPledgeRow } from './vow-pledge.models.js';
import { VOWS_REPOSITORY, type VowsRepository } from './vows.repository.js';

export interface CreateVowPledgeCommand {
  personId: number;
  contributionTypeId: number;
  pledgedAmount: number;
  pledgedOn: string;
  dueOn: string | null;
  description: string | null;
  ipAddress?: string | null;
}

export const VowErrorCode = {
  VOW_TYPE_INVALID: 'VOW_TYPE_INVALID',
  PERSON_NOT_FOUND: 'PERSON_NOT_FOUND',
  VOW_PLEDGE_CANCELLED: 'VOW_PLEDGE_CANCELLED',
  VOW_PLEDGE_FULFILLED: 'VOW_PLEDGE_FULFILLED',
  VOW_AMOUNT_BELOW_PAID: 'VOW_AMOUNT_BELOW_PAID',
  VOW_PLEDGE_CHANGED: 'VOW_PLEDGE_CHANGED',
} as const;

/** Registers the promise of a member to give a vow. It is born active, with no payments. */
@Injectable()
export class CreateVowPledgeUseCase {
  constructor(
    @Inject(VOWS_REPOSITORY) private readonly repository: VowsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    command: CreateVowPledgeCommand,
  ): Promise<VowPledgeRow> {
    const scope = requireCongregationScope(
      tenant,
      'registrar promesas de voto',
    );
    const today = this.clock.today();
    const pledgedAmount = validAmount(command.pledgedAmount, 'prometido');
    const pledgedOn = validPastOrTodayDate(
      command.pledgedOn,
      today,
      'de la promesa',
    );
    const dueOn = validDueDate(command.dueOn, pledgedOn);
    const description = validNotes(command.description, 'Las observaciones');

    if (!(await this.repository.personExists(scope, command.personId))) {
      throw new NotFoundDomainException(
        'La persona no pertenece a la denominación.',
        VowErrorCode.PERSON_NOT_FOUND,
      );
    }
    const type = await this.repository.findType(
      scope,
      command.contributionTypeId,
    );
    if (!type || type.category !== 'VOW' || !type.isActive) {
      throw new BusinessRuleException(
        'El tipo de aporte debe ser un Voto activo.',
        VowErrorCode.VOW_TYPE_INVALID,
      );
    }

    const id = await this.transactions.run(async (transaction) => {
      const created = await this.repository.create(
        scope,
        {
          personId: command.personId,
          contributionTypeId: type.id,
          pledgedAmount,
          pledgedOn,
          dueOn,
          description,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'VOW_PLEDGE_CREATED',
          entity: 'VowPledge',
          entityId: created,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            null,
            { status: 'ACTIVE', pledgedAmount, dueOn },
            ['status', 'pledgedAmount', 'dueOn'],
          ),
          ipAddress: command.ipAddress ?? null,
        },
        transaction,
      );
      return created;
    });

    const record = await this.repository.findById(scope, id);
    if (!record) {
      throw new NotFoundDomainException(
        'La promesa de voto no existe en la sede.',
      );
    }
    return toVowPledgeRow(record, today);
  }
}

/** The due date, if any, is a real date that does not precede the promise. */
export function validDueDate(
  dueOn: string | null | undefined,
  pledgedOn: string,
): string | null {
  if (dueOn === null || dueOn === undefined || dueOn === '') {
    return null;
  }
  if (!isIsoDate(dueOn)) {
    throw new InvalidInputException(
      'La fecha límite no es válida.',
      'INVALID_DATE',
    );
  }
  if (dueOn < pledgedOn) {
    throw new InvalidInputException(
      'La fecha límite no puede ser anterior a la fecha de la promesa.',
      'INVALID_DATE',
    );
  }
  return dueOn;
}
