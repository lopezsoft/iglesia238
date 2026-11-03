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
import { Clock } from '../../../common/time/bogota-time.js';
import {
  assertNameAvailable,
  normalizeDenominationName,
  requirePlatformScope,
} from './denomination-rules.js';
import { DENOMINATION_TEMPLATE } from './denomination-template.js';
import {
  DENOMINATION_PROVISIONER,
  DENOMINATION_REPOSITORY,
  type DenominationProvisioner,
  type DenominationRepository,
} from './denomination.repository.port.js';
import {
  type DenominationSummaryView,
  toDenominationView,
} from './denomination.view.js';

export interface CreateDenominationCommand {
  readonly context: TenantContext;
  readonly name: string;
  readonly ipAddress: string | null;
}

/**
 * Creates the denomination and everything it needs to operate in ONE transaction: if any part of the
 * template fails, no half-built denomination remains.
 */
@Injectable()
export class CreateDenominationUseCase {
  constructor(
    @Inject(DENOMINATION_REPOSITORY)
    private readonly denominations: DenominationRepository,
    @Inject(DENOMINATION_PROVISIONER)
    private readonly provisioner: DenominationProvisioner,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: CreateDenominationCommand,
  ): Promise<DenominationSummaryView> {
    requirePlatformScope(command.context);
    const name = normalizeDenominationName(command.name);
    assertNameAvailable(name, await this.denominations.listNames(), null);

    const id = await this.transactions.run(async (transaction) => {
      const created = await this.denominations.create(name, transaction);
      await this.provisioner.provision(
        created,
        DENOMINATION_TEMPLATE,
        this.clock.today(),
        transaction,
      );
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'Denomination',
          entityId: created,
          actor: command.context,
          denominationId: created,
          changes: buildAuditChanges(null, { name, isActive: true }, [
            'name',
            'isActive',
          ]),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
      return created;
    });

    const record = await this.denominations.findById(id);
    if (!record) {
      throw new NotFoundDomainException('La denominación no existe.');
    }
    return toDenominationView(record);
  }
}
