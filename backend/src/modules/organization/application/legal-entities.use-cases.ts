import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  FIELD_LIMITS,
  canonicalTaxId,
  denominationAuditActor,
  denominationScopeOf,
  optionalEmail,
  optionalText,
  requiredText,
} from './organization-rules.js';
import {
  GEO_REPOSITORY,
  LEGAL_ENTITY_REPOSITORY,
  type GeoRepository,
  type LegalEntityData,
  type LegalEntityRecord,
  type LegalEntityRepository,
} from './organization.ports.js';
import {
  type LegalEntityView,
  toLegalEntityView,
} from './organization.views.js';

const NOT_FOUND = 'La razón social no existe en tu denominación.';

export interface LegalEntityInput {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly legalRepresentative: string;
  readonly municipalityCode: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
}

export interface LegalEntityCommand {
  readonly context: TenantContext;
  readonly ipAddress: string | null;
}

async function requireLegalEntity(
  legalEntities: LegalEntityRepository,
  scope: TenantScope,
  id: number,
): Promise<LegalEntityRecord> {
  const row = await legalEntities.findById(scope, id);
  if (!row) {
    throw new NotFoundDomainException(NOT_FOUND);
  }
  return row;
}

@Injectable()
export class LegalEntityInputValidator {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(GEO_REPOSITORY) private readonly geo: GeoRepository,
  ) {}

  async validate(
    input: LegalEntityInput,
    exceptId: number | null,
  ): Promise<LegalEntityData & { municipalityCode: string }> {
    const taxId = canonicalTaxId(input.taxId);
    // The NIT is unique across every denomination of the platform.
    if (await this.legalEntities.taxIdExists(taxId, exceptId)) {
      throw new ConflictDomainException(
        'Ya existe una razón social registrada con ese NIT.',
        'DUPLICATE_TAX_ID',
      );
    }
    const municipality = await this.geo.findMunicipalityByCode(
      input.municipalityCode,
    );
    if (!municipality) {
      throw new InvalidInputException(
        'Selecciona un municipio válido.',
        'INVALID_MUNICIPALITY',
      );
    }
    return {
      legalName: requiredText(
        input.legalName,
        'La razón social',
        FIELD_LIMITS.legalName,
      ),
      tradeName: optionalText(
        input.tradeName,
        'El nombre comercial',
        FIELD_LIMITS.legalName,
      ),
      taxId,
      legalRepresentative: requiredText(
        input.legalRepresentative,
        'El representante legal',
        FIELD_LIMITS.legalName,
      ),
      municipalityId: municipality.id,
      municipalityCode: municipality.code,
      email: optionalEmail(input.email),
      phone: optionalText(input.phone, 'El teléfono', FIELD_LIMITS.phone),
      address: optionalText(
        input.address,
        'La dirección',
        FIELD_LIMITS.address,
      ),
    };
  }
}

@Injectable()
export class ListLegalEntitiesUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
  ) {}

  async execute(context: TenantContext): Promise<LegalEntityView[]> {
    const rows = await this.legalEntities.list(denominationScopeOf(context));
    return rows.map(toLegalEntityView);
  }
}

@Injectable()
export class CreateLegalEntityUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    private readonly validator: LegalEntityInputValidator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: LegalEntityCommand & { input: LegalEntityInput },
  ): Promise<LegalEntityView> {
    const scope = denominationScopeOf(command.context);
    const data = await this.validator.validate(command.input, null);

    const id = await this.transactions.run(async (transaction) => {
      const created = await this.legalEntities.create(scope, data, transaction);
      // The audit trail carries the name and the state only: no NIT, representative, address, phone or email.
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'LegalEntity',
          entityId: created,
          actor: denominationAuditActor(command.context),
          changes: buildAuditChanges(null, { ...data, isActive: true }, [
            'legalName',
            'isActive',
          ]),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
      return created;
    });
    return toLegalEntityView(
      await requireLegalEntity(this.legalEntities, scope, id),
    );
  }
}

@Injectable()
export class UpdateLegalEntityUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    private readonly validator: LegalEntityInputValidator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: LegalEntityCommand & { id: number; input: LegalEntityInput },
  ): Promise<LegalEntityView> {
    const scope = denominationScopeOf(command.context);
    const current = await requireLegalEntity(
      this.legalEntities,
      scope,
      command.id,
    );
    const data = await this.validator.validate(command.input, current.id);

    await this.transactions.run(async (transaction) => {
      await this.legalEntities.update(scope, current.id, data, transaction);
      // The NIT is sensitive for the audit rules: only the fact that it changed is recorded.
      const changes = buildAuditChanges(
        { ...current, fiscalIdentifierChanged: false },
        { ...data, fiscalIdentifierChanged: data.taxId !== current.taxId },
        [
          'legalName',
          'tradeName',
          'fiscalIdentifierChanged',
          'municipalityCode',
        ],
      );
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            action: 'UPDATE',
            entity: 'LegalEntity',
            entityId: current.id,
            actor: denominationAuditActor(command.context),
            changes,
            ipAddress: command.ipAddress,
          },
          transaction,
        );
      }
    });
    return toLegalEntityView(
      await requireLegalEntity(this.legalEntities, scope, current.id),
    );
  }
}

@Injectable()
export class SetLegalEntityActiveUseCase {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: LegalEntityCommand & { id: number; isActive: boolean },
  ): Promise<LegalEntityView> {
    const scope = denominationScopeOf(command.context);
    const current = await requireLegalEntity(
      this.legalEntities,
      scope,
      command.id,
    );
    if (current.isActive === command.isActive) {
      return toLegalEntityView(current);
    }
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
          actor: denominationAuditActor(command.context),
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
    return toLegalEntityView(
      await requireLegalEntity(this.legalEntities, scope, current.id),
    );
  }
}
