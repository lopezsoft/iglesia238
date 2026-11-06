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
import { toIsoDateTime } from '../../../common/mappers/value-mappers.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { requirePlatformScope } from '../../denominations/application/denomination-rules.js';
import {
  LegalEntityInputValidator,
  toLegalEntityData,
  type LegalEntityInput,
} from './legal-entities.use-cases.js';
import {
  LEGAL_ENTITY_REPOSITORY,
  PLATFORM_LEGAL_ENTITY_READER,
  type LegalEntityRepository,
  type PlatformLegalEntityReader,
  type PlatformLegalEntityRecord,
} from './organization.ports.js';
import {
  type LegalEntityView,
  toLegalEntityView,
} from './organization.views.js';

const NOT_FOUND = 'La razón social no existe.';
const DENOMINATION_NOT_FOUND = 'La denominación no existe.';

export interface PlatformLegalEntityView extends LegalEntityView {
  readonly denominationName: string;
  readonly congregationCount: number;
}

export function toPlatformLegalEntityView(
  record: PlatformLegalEntityRecord,
): PlatformLegalEntityView {
  return {
    ...toLegalEntityView(record),
    createdAt: toIsoDateTime(record.createdAt),
    denominationName: record.denominationName,
    congregationCount: record.congregationCount,
  };
}

export interface PlatformLegalEntityCommand {
  readonly context: TenantContext;
  readonly ipAddress: string | null;
}

/** Fields that can change in a partial update; `undefined` keeps the current value. */
export type LegalEntityPatch = {
  readonly [K in keyof LegalEntityInput]?: LegalEntityInput[K] | undefined;
};

async function requireRecord(
  reader: PlatformLegalEntityReader,
  id: number,
): Promise<PlatformLegalEntityRecord> {
  const record = await reader.findById(id);
  if (!record) {
    throw new NotFoundDomainException(NOT_FOUND);
  }
  return record;
}

/** The scope of the denomination that owns the legal entity: the repository port never runs without one. */
function scopeOf(record: { denominationId: number }): TenantScope {
  return TenantScope.of(record.denominationId);
}

/** The platform acts without a tenant of its own; the entry carries the denomination it touched. */
function auditActorOf(context: TenantContext) {
  return { userId: context.userId, denominationId: null, congregationId: null };
}

@Injectable()
export class ListPlatformLegalEntitiesUseCase {
  constructor(
    @Inject(PLATFORM_LEGAL_ENTITY_READER)
    private readonly reader: PlatformLegalEntityReader,
  ) {}

  async execute(
    context: TenantContext,
    denominationId: number | null,
  ): Promise<PlatformLegalEntityView[]> {
    requirePlatformScope(context);
    const rows = await this.reader.list(denominationId);
    return rows.map(toPlatformLegalEntityView);
  }
}

/**
 * The platform administrator creates the legal entities (razones sociales) of every church. It reuses
 * the validation and the repository port of the organization module; only the scope changes: the
 * denomination comes from the request body and is checked here.
 */
@Injectable()
export class CreatePlatformLegalEntityUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(PLATFORM_LEGAL_ENTITY_READER)
    private readonly reader: PlatformLegalEntityReader,
    private readonly validator: LegalEntityInputValidator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: PlatformLegalEntityCommand & {
      denominationId: number;
      input: LegalEntityInput;
    },
  ): Promise<PlatformLegalEntityView> {
    requirePlatformScope(command.context);
    const denomination = await this.reader.findDenomination(
      command.denominationId,
    );
    if (!denomination) {
      throw new NotFoundDomainException(DENOMINATION_NOT_FOUND);
    }
    if (!denomination.isActive) {
      throw new ConflictDomainException(
        'La denominación está inactiva: actívala antes de crearle razones sociales.',
        'DENOMINATION_INACTIVE',
      );
    }
    const data = await this.validator.validate(command.input, null);

    const id = await this.transactions.run(async (transaction) => {
      const created = await this.legalEntities.create(
        TenantScope.of(denomination.id),
        toLegalEntityData(data),
        transaction,
      );
      // Name and state only: no NIT, representative, address, phone or e-mail in the trail.
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'LegalEntity',
          entityId: created,
          actor: auditActorOf(command.context),
          denominationId: denomination.id,
          changes: buildAuditChanges(null, { ...data, isActive: true }, [
            'legalName',
            'countryId',
            'isActive',
          ]),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
      return created;
    });
    return toPlatformLegalEntityView(await requireRecord(this.reader, id));
  }
}

@Injectable()
export class UpdatePlatformLegalEntityUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(PLATFORM_LEGAL_ENTITY_READER)
    private readonly reader: PlatformLegalEntityReader,
    private readonly validator: LegalEntityInputValidator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** Partial update: the fields that are not sent keep their value, and the result is validated whole. */
  async execute(
    command: PlatformLegalEntityCommand & {
      id: number;
      patch: LegalEntityPatch;
    },
  ): Promise<PlatformLegalEntityView> {
    requirePlatformScope(command.context);
    const current = await requireRecord(this.reader, command.id);
    const scope = scopeOf(current);
    const { patch } = command;
    const data = await this.validator.validate(
      {
        legalName: patch.legalName ?? current.legalName,
        tradeName:
          patch.tradeName !== undefined ? patch.tradeName : current.tradeName,
        taxId: patch.taxId ?? current.taxId,
        legalRepresentative:
          patch.legalRepresentative ?? current.legalRepresentative ?? '',
        countryId: patch.countryId ?? current.countryId,
        // null removes the municipality; undefined keeps it.
        municipalityCode:
          patch.municipalityCode !== undefined
            ? patch.municipalityCode
            : current.municipalityCode,
        email: patch.email !== undefined ? patch.email : current.email,
        phone: patch.phone !== undefined ? patch.phone : current.phone,
        address: patch.address !== undefined ? patch.address : current.address,
      },
      {
        current,
        congregationCount: current.congregationCount,
        municipalitySent: patch.municipalityCode !== undefined,
      },
    );

    await this.transactions.run(async (transaction) => {
      await this.legalEntities.update(
        scope,
        current.id,
        toLegalEntityData(data),
        transaction,
      );
      // The NIT is sensitive for the audit rules: only the fact that it changed is recorded.
      const changes = buildAuditChanges(
        { ...current, fiscalIdentifierChanged: false },
        { ...data, fiscalIdentifierChanged: data.taxId !== current.taxId },
        [
          'legalName',
          'tradeName',
          'fiscalIdentifierChanged',
          'countryId',
          'municipalityCode',
        ],
      );
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            action: 'UPDATE',
            entity: 'LegalEntity',
            entityId: current.id,
            actor: auditActorOf(command.context),
            denominationId: current.denominationId,
            changes,
            ipAddress: command.ipAddress,
          },
          transaction,
        );
      }
    });
    return toPlatformLegalEntityView(
      await requireRecord(this.reader, current.id),
    );
  }
}

@Injectable()
export class SetPlatformLegalEntityActiveUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(PLATFORM_LEGAL_ENTITY_READER)
    private readonly reader: PlatformLegalEntityReader,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: PlatformLegalEntityCommand & { id: number; isActive: boolean },
  ): Promise<PlatformLegalEntityView> {
    requirePlatformScope(command.context);
    const current = await requireRecord(this.reader, command.id);
    if (current.isActive === command.isActive) {
      return toPlatformLegalEntityView(current);
    }
    const scope = scopeOf(current);
    if (
      !command.isActive &&
      (await this.legalEntities.countActiveCongregations(scope, current.id)) > 0
    ) {
      throw new ConflictDomainException(
        'La razón social tiene sedes activas: asígnales otra razón social antes de desactivarla.',
        'LEGAL_ENTITY_IN_USE',
      );
    }

    await this.transactions.run(async (transaction) => {
      await this.legalEntities.setActive(
        scope,
        current.id,
        command.isActive,
        transaction,
      );
      await this.audit.record(
        {
          action: command.isActive ? 'ACTIVATE' : 'DEACTIVATE',
          entity: 'LegalEntity',
          entityId: current.id,
          actor: auditActorOf(command.context),
          denominationId: current.denominationId,
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
    return toPlatformLegalEntityView(
      await requireRecord(this.reader, current.id),
    );
  }
}
