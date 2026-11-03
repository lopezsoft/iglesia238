import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  assertNameAvailable,
  normalizeDenominationName,
  requirePlatformScope,
} from './denomination-rules.js';
import {
  DENOMINATION_REPOSITORY,
  type DenominationRecord,
  type DenominationRepository,
} from './denomination.repository.port.js';
import {
  type DenominationSummaryView,
  toDenominationView,
} from './denomination.view.js';

const NOT_FOUND_MESSAGE = 'La denominación no existe.';

export interface RenameDenominationCommand {
  readonly context: TenantContext;
  readonly id: number;
  readonly name: string;
  readonly ipAddress: string | null;
}

export interface SetDenominationStatusCommand {
  readonly context: TenantContext;
  readonly id: number;
  readonly isActive: boolean;
  readonly ipAddress: string | null;
}

async function requireDenomination(
  denominations: DenominationRepository,
  id: number,
): Promise<DenominationRecord> {
  const record = await denominations.findById(id);
  if (!record) {
    throw new NotFoundDomainException(NOT_FOUND_MESSAGE);
  }
  return record;
}

@Injectable()
export class RenameDenominationUseCase {
  constructor(
    @Inject(DENOMINATION_REPOSITORY)
    private readonly denominations: DenominationRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: RenameDenominationCommand,
  ): Promise<DenominationSummaryView> {
    requirePlatformScope(command.context);
    const current = await requireDenomination(this.denominations, command.id);
    const name = normalizeDenominationName(command.name);
    if (name === current.name) {
      return toDenominationView(current);
    }
    assertNameAvailable(name, await this.denominations.listNames(), current.id);

    await this.transactions.run(async (transaction) => {
      await this.denominations.rename(current.id, name, transaction);
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'Denomination',
          entityId: current.id,
          actor: command.context,
          denominationId: current.id,
          changes: buildAuditChanges({ name: current.name }, { name }, [
            'name',
          ]),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
    });
    return toDenominationView(
      await requireDenomination(this.denominations, current.id),
    );
  }
}

@Injectable()
export class SetDenominationStatusUseCase {
  constructor(
    @Inject(DENOMINATION_REPOSITORY)
    private readonly denominations: DenominationRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /**
   * Deactivating keeps every row, but nobody with a role in the denomination can act on it anymore:
   * the role assignments reader ignores assignments of inactive denominations.
   */
  async execute(
    command: SetDenominationStatusCommand,
  ): Promise<DenominationSummaryView> {
    requirePlatformScope(command.context);
    const current = await requireDenomination(this.denominations, command.id);
    if (current.isActive === command.isActive) {
      return toDenominationView(current);
    }

    await this.transactions.run(async (transaction) => {
      await this.denominations.setActive(
        current.id,
        command.isActive,
        transaction,
      );
      await this.audit.record(
        {
          action: command.isActive ? 'ACTIVATE' : 'DEACTIVATE',
          entity: 'Denomination',
          entityId: current.id,
          actor: command.context,
          denominationId: current.id,
          changes: buildAuditChanges(
            { isActive: current.isActive },
            { isActive: command.isActive },
            ['isActive'],
          ),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
    });
    return toDenominationView(
      await requireDenomination(this.denominations, current.id),
    );
  }
}
