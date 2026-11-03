import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { requirePlatformScope } from '../../denominations/application/denomination-rules.js';
import {
  PLATFORM_COUNTRY_STORE,
  type PlatformCountryRecord,
  type PlatformCountryStore,
} from './catalogs.reader.js';

export type PlatformCountryView = PlatformCountryRecord;

/** GET /platform/countries: every country, with what is loaded of its geography. */
@Injectable()
export class ListPlatformCountriesUseCase {
  constructor(
    @Inject(PLATFORM_COUNTRY_STORE)
    private readonly store: PlatformCountryStore,
  ) {}

  async execute(context: TenantContext): Promise<PlatformCountryView[]> {
    requirePlatformScope(context);
    return this.store.list();
  }
}

/**
 * Turns a country on or off for the whole system. An inactive country is not offered for legal
 * entities nor in the municipality searches, so it cannot be turned off while active legal entities
 * live in it.
 */
@Injectable()
export class SetCountryActiveUseCase {
  constructor(
    @Inject(PLATFORM_COUNTRY_STORE)
    private readonly store: PlatformCountryStore,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: {
    context: TenantContext;
    ipAddress: string | null;
    id: number;
    isActive: boolean;
  }): Promise<PlatformCountryView> {
    requirePlatformScope(command.context);
    const current = await this.requireCountry(command.id);
    if (current.isActive === command.isActive) {
      return current;
    }
    if (
      !command.isActive &&
      (await this.store.countActiveLegalEntities(current.id)) > 0
    ) {
      throw new ConflictDomainException(
        'El país tiene razones sociales activas: desactívalas o cámbiales el país antes de desactivarlo.',
        'COUNTRY_IN_USE',
      );
    }

    await this.transactions.run(async (transaction) => {
      await this.store.setActive(current.id, command.isActive, transaction);
      await this.audit.record(
        {
          action: command.isActive ? 'ACTIVATE' : 'DEACTIVATE',
          entity: 'Country',
          entityId: current.id,
          // The platform acts without a tenant of its own.
          actor: {
            userId: command.context.userId,
            denominationId: null,
            congregationId: null,
          },
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
    return this.requireCountry(current.id);
  }

  private async requireCountry(id: number): Promise<PlatformCountryRecord> {
    const country = await this.store.findById(id);
    if (!country) {
      throw new NotFoundDomainException(
        'El país no existe.',
        'COUNTRY_NOT_FOUND',
      );
    }
    return country;
  }
}
