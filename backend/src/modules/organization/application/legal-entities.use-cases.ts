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
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  FIELD_LIMITS,
  canonicalTaxId,
  countryInactive,
  countryNotFound,
  denominationAuditActor,
  denominationScopeOf,
  municipalityCountryMismatch,
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
  readonly countryId: number;
  /** Optional: null leaves the legal entity without a municipality. */
  readonly municipalityCode: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
}

/** The edit of the denomination: an absent country keeps the current one. */
export type LegalEntityUpdateInput = Omit<LegalEntityInput, 'countryId'> & {
  readonly countryId: number | null;
};

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

/** What an edit needs to know about the legal entity it changes. */
export interface LegalEntityChange {
  readonly current: LegalEntityRecord;
  /** Congregations of the legal entity that are not deleted. */
  readonly congregationCount: number;
  /**
   * False when the request kept the current municipality without sending one (a partial update that
   * omits municipalityCode).
   */
  readonly municipalitySent: boolean;
}

export type ValidatedLegalEntity = LegalEntityData & {
  readonly municipalityCode: string | null;
};

export function toLegalEntityData(
  validated: ValidatedLegalEntity,
): LegalEntityData {
  return {
    legalName: validated.legalName,
    tradeName: validated.tradeName,
    taxId: validated.taxId,
    legalRepresentative: validated.legalRepresentative,
    countryId: validated.countryId,
    municipalityId: validated.municipalityId,
    email: validated.email,
    phone: validated.phone,
    address: validated.address,
  };
}

@Injectable()
export class LegalEntityInputValidator {
  constructor(
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(GEO_REPOSITORY) private readonly geo: GeoRepository,
  ) {}

  /**
   * Rules of a legal entity: unique NIT, an existing and active country and, when there is one, a municipality of
   * that country. On an edit, the country cannot change while congregations hang from the legal entity
   * (their municipalities belong to the old country), and a municipality of the old country must be
   * replaced (or removed) in the same request.
   */
  async validate(
    input: LegalEntityInput,
    change: LegalEntityChange | null,
  ): Promise<ValidatedLegalEntity> {
    const taxId = canonicalTaxId(input.taxId);
    // The NIT is unique across every denomination of the platform.
    if (
      await this.legalEntities.taxIdExists(taxId, change?.current.id ?? null)
    ) {
      throw new ConflictDomainException(
        'Ya existe una razón social registrada con ese NIT.',
        'DUPLICATE_TAX_ID',
      );
    }
    const country = await this.geo.findCountry(input.countryId);
    if (!country) {
      throw countryNotFound();
    }
    if (!country.isActive) {
      throw countryInactive();
    }
    if (change && country.id !== change.current.countryId) {
      if (change.congregationCount > 0) {
        throw new ConflictDomainException(
          'La razón social tiene sedes: no se puede cambiar su país, porque el municipio de cada sede es del país actual.',
          'LEGAL_ENTITY_HAS_CONGREGATIONS',
        );
      }
      if (
        change.current.municipalityCode !== null &&
        !change.municipalitySent
      ) {
        throw municipalityCountryMismatch();
      }
    }
    const municipality = await this.resolveMunicipality(
      country.id,
      input.municipalityCode,
    );
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
      countryId: country.id,
      municipalityId: municipality?.id ?? null,
      municipalityCode: municipality?.code ?? null,
      email: optionalEmail(input.email),
      phone: optionalText(input.phone, 'El teléfono', FIELD_LIMITS.phone),
      address: optionalText(
        input.address,
        'La dirección',
        FIELD_LIMITS.address,
      ),
    };
  }

  private async resolveMunicipality(countryId: number, rawCode: string | null) {
    const code = optionalText(rawCode, 'El municipio', 10);
    if (code === null) {
      return null;
    }
    const municipality = await this.geo.findMunicipality(countryId, code);
    if (!municipality) {
      throw municipalityCountryMismatch();
    }
    return municipality;
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
      const created = await this.legalEntities.create(
        scope,
        toLegalEntityData(data),
        transaction,
      );
      // The audit trail carries the name and the state only: no NIT, representative, address, phone or email.
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'LegalEntity',
          entityId: created,
          actor: denominationAuditActor(command.context),
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
    command: LegalEntityCommand & { id: number; input: LegalEntityUpdateInput },
  ): Promise<LegalEntityView> {
    const scope = denominationScopeOf(command.context);
    const current = await requireLegalEntity(
      this.legalEntities,
      scope,
      command.id,
    );
    const input: LegalEntityInput = {
      ...command.input,
      countryId: command.input.countryId ?? current.countryId,
    };
    const data = await this.validator.validate(input, {
      current,
      congregationCount: await this.legalEntities.countCongregations(
        scope,
        current.id,
      ),
      // The edit of the denomination sends the whole legal entity: an absent municipality removes it.
      municipalitySent: true,
    });

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
