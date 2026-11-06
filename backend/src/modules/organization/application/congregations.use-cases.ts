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
import { comparableText } from '../../../common/text/comparable-text.js';
import {
  FIELD_LIMITS,
  denominationAuditActor,
  denominationScopeOf,
  generateCongregationCode,
  municipalityCountryMismatch,
  normalizeCode,
  optionalEmail,
  optionalText,
  requiredText,
} from './organization-rules.js';
import {
  CONGREGATION_REPOSITORY,
  DISTRICT_REPOSITORY,
  GEO_REPOSITORY,
  LEGAL_ENTITY_REPOSITORY,
  type CongregationData,
  type CongregationRecord,
  type CongregationRepository,
  type DistrictRepository,
  type GeoRepository,
  type LegalEntityRepository,
} from './organization.ports.js';
import {
  type CongregationView,
  toCongregationView,
} from './organization.views.js';

const NOT_FOUND = 'La sede no existe en tu denominación.';
const AUDITED_FIELDS = [
  'name',
  'code',
  'legalEntityId',
  'districtId',
  'municipalityCode',
  'acceptsApplications',
] as const;

function toCongregationData(
  fields: ValidatedCongregation,
  neighborhoodId: number | null,
): CongregationData {
  return {
    name: fields.name,
    code: fields.code,
    legalEntityId: fields.legalEntityId,
    districtId: fields.districtId,
    municipalityId: fields.municipalityId,
    neighborhoodId,
    address: fields.address,
    phone: fields.phone,
    email: fields.email,
    acceptsApplications: fields.acceptsApplications,
  };
}

export interface CongregationInput {
  readonly name: string;
  /** Optional abbreviation; generated from the name when absent on creation. */
  readonly code?: string | null;
  readonly legalEntityId: number;
  readonly districtId: number | null;
  readonly municipalityCode: string;
  readonly neighborhood: string | null;
  readonly address: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly acceptsApplications: boolean;
}

interface ValidatedCongregation {
  readonly name: string;
  readonly code: string;
  readonly legalEntityId: number;
  readonly districtId: number | null;
  readonly municipalityId: number;
  readonly municipalityCode: string;
  readonly neighborhood: string | null;
  readonly address: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly acceptsApplications: boolean;
}

/** Rules shared by creating and editing a sede. */
@Injectable()
export class CongregationInputValidator {
  constructor(
    @Inject(CONGREGATION_REPOSITORY)
    private readonly congregations: CongregationRepository,
    @Inject(LEGAL_ENTITY_REPOSITORY)
    private readonly legalEntities: LegalEntityRepository,
    @Inject(DISTRICT_REPOSITORY) private readonly districts: DistrictRepository,
    @Inject(GEO_REPOSITORY) private readonly geo: GeoRepository,
  ) {}

  async validate(
    scope: TenantScope,
    input: CongregationInput,
    current: CongregationRecord | null,
  ): Promise<ValidatedCongregation> {
    const name = requiredText(
      input.name,
      'El nombre de la sede',
      FIELD_LIMITS.congregationName,
      'NAME_REQUIRED',
    );
    const identifiers = await this.congregations.listIdentifiers(scope);
    const others = identifiers.filter((row) => row.id !== current?.id);
    if (
      others.some((row) => comparableText(row.name) === comparableText(name))
    ) {
      throw new ConflictDomainException(
        'Ya existe una sede con ese nombre en la denominación.',
        'DUPLICATE_NAME',
      );
    }
    const code = this.resolveCode(input.code, name, current, others);

    const legalEntity = await this.legalEntities.findById(
      scope,
      input.legalEntityId,
    );
    if (!legalEntity) {
      throw new NotFoundDomainException(
        'La razón social no existe en tu denominación.',
      );
    }
    if (!legalEntity.isActive && legalEntity.id !== current?.legalEntityId) {
      throw new ConflictDomainException(
        'La razón social está inactiva.',
        'LEGAL_ENTITY_INACTIVE',
      );
    }

    if (
      input.districtId !== null &&
      !(await this.districts.findById(scope, input.districtId))
    ) {
      throw new NotFoundDomainException(
        'El distrito no existe en tu denominación.',
      );
    }

    // The sede is in the country of its legal entity, so the code is resolved inside that country
    // (codes repeat across countries). Changing the legal entity on an edit validates it again.
    const municipalityCode = requiredText(
      input.municipalityCode,
      'El municipio de la sede',
      10,
      'MUNICIPALITY_REQUIRED',
    );
    const municipality = await this.geo.findMunicipality(
      legalEntity.countryId,
      municipalityCode,
    );
    if (!municipality) {
      throw municipalityCountryMismatch();
    }

    return {
      name,
      code,
      legalEntityId: legalEntity.id,
      districtId: input.districtId,
      municipalityId: municipality.id,
      municipalityCode: municipality.code,
      neighborhood: optionalText(
        input.neighborhood,
        'El barrio',
        FIELD_LIMITS.neighborhood,
      ),
      address: requiredText(
        input.address,
        'La dirección',
        FIELD_LIMITS.address,
      ),
      phone: optionalText(input.phone, 'El teléfono', FIELD_LIMITS.phone),
      email: optionalEmail(input.email),
      // An inactive sede never receives applications.
      acceptsApplications:
        input.acceptsApplications && (current?.isActive ?? true),
    };
  }

  private resolveCode(
    requested: string | null | undefined,
    name: string,
    current: CongregationRecord | null,
    others: readonly { code: string }[],
  ): string {
    const taken = new Set(others.map((row) => row.code.toUpperCase()));
    const wanted = normalizeCode(requested ?? '');
    if (wanted === '') {
      return current?.code ?? generateCongregationCode(name, taken);
    }
    if (wanted.length < 2 || wanted.length > FIELD_LIMITS.congregationCode) {
      throw new InvalidInputException(
        `El código debe tener entre 2 y ${FIELD_LIMITS.congregationCode} letras o números.`,
        'INVALID_CODE',
      );
    }
    if (taken.has(wanted)) {
      throw new ConflictDomainException(
        'Ya existe una sede con ese código en la denominación.',
        'DUPLICATE_CODE',
      );
    }
    return wanted;
  }
}

async function requireCongregation(
  congregations: CongregationRepository,
  scope: TenantScope,
  id: number,
): Promise<CongregationRecord> {
  const row = await congregations.findById(scope, id);
  if (!row) {
    throw new NotFoundDomainException(NOT_FOUND);
  }
  return row;
}

export interface CongregationCommand {
  readonly context: TenantContext;
  readonly ipAddress: string | null;
}

@Injectable()
export class ListCongregationsUseCase {
  constructor(
    @Inject(CONGREGATION_REPOSITORY)
    private readonly congregations: CongregationRepository,
  ) {}

  async execute(context: TenantContext): Promise<CongregationView[]> {
    const rows = await this.congregations.list(denominationScopeOf(context));
    return rows.map(toCongregationView);
  }
}

/** Sedes any session can pick: the active ones inside its scope. */
@Injectable()
export class ListSelectableCongregationsUseCase {
  constructor(
    @Inject(CONGREGATION_REPOSITORY)
    private readonly congregations: CongregationRepository,
  ) {}

  async execute(context: TenantContext): Promise<CongregationView[]> {
    const rows = await this.congregations.listSelectable(context.tenantScope());
    return rows.map(toCongregationView);
  }
}

@Injectable()
export class CreateCongregationUseCase {
  constructor(
    @Inject(CONGREGATION_REPOSITORY)
    private readonly congregations: CongregationRepository,
    @Inject(GEO_REPOSITORY) private readonly geo: GeoRepository,
    private readonly validator: CongregationInputValidator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: CongregationCommand & { input: CongregationInput },
  ): Promise<CongregationView> {
    const scope = denominationScopeOf(command.context);
    const fields = await this.validator.validate(scope, command.input, null);

    const id = await this.transactions.run(async (transaction) => {
      const neighborhood = fields.neighborhood
        ? await this.geo.findOrCreateNeighborhood(
            fields.municipalityId,
            fields.neighborhood,
            transaction,
          )
        : null;
      const created = await this.congregations.create(
        scope,
        toCongregationData(fields, neighborhood?.id ?? null),
        transaction,
      );
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'Congregation',
          entityId: created,
          actor: denominationAuditActor(command.context),
          congregationId: created,
          changes: buildAuditChanges(null, { ...fields }, AUDITED_FIELDS),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
      return created;
    });
    return toCongregationView(
      await requireCongregation(this.congregations, scope, id),
    );
  }
}

@Injectable()
export class UpdateCongregationUseCase {
  constructor(
    @Inject(CONGREGATION_REPOSITORY)
    private readonly congregations: CongregationRepository,
    @Inject(GEO_REPOSITORY) private readonly geo: GeoRepository,
    private readonly validator: CongregationInputValidator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: CongregationCommand & { id: number; input: CongregationInput },
  ): Promise<CongregationView> {
    const scope = denominationScopeOf(command.context);
    const current = await requireCongregation(
      this.congregations,
      scope,
      command.id,
    );
    const fields = await this.validator.validate(scope, command.input, current);

    await this.transactions.run(async (transaction) => {
      const neighborhood = fields.neighborhood
        ? await this.geo.findOrCreateNeighborhood(
            fields.municipalityId,
            fields.neighborhood,
            transaction,
          )
        : null;
      await this.congregations.update(
        scope,
        current.id,
        toCongregationData(fields, neighborhood?.id ?? null),
        transaction,
      );
      const changes = buildAuditChanges(
        { ...current },
        { ...fields },
        AUDITED_FIELDS,
      );
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            action: 'UPDATE',
            entity: 'Congregation',
            entityId: current.id,
            actor: denominationAuditActor(command.context),
            congregationId: current.id,
            changes,
            ipAddress: command.ipAddress,
          },
          transaction,
        );
      }
    });
    return toCongregationView(
      await requireCongregation(this.congregations, scope, current.id),
    );
  }
}

@Injectable()
export class SetCongregationActiveUseCase {
  constructor(
    @Inject(CONGREGATION_REPOSITORY)
    private readonly congregations: CongregationRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** Deactivating also closes applications; activating does not reopen them by itself. */
  async execute(
    command: CongregationCommand & { id: number; isActive: boolean },
  ): Promise<CongregationView> {
    const scope = denominationScopeOf(command.context);
    const current = await requireCongregation(
      this.congregations,
      scope,
      command.id,
    );
    if (current.isActive === command.isActive) {
      return toCongregationView(current);
    }
    const acceptsApplications = command.isActive
      ? current.acceptsApplications
      : false;

    await this.transactions.run(async (transaction) => {
      await this.congregations.patch(
        scope,
        current.id,
        { isActive: command.isActive, acceptsApplications },
        transaction,
      );
      await this.audit.record(
        {
          action: command.isActive ? 'ACTIVATE' : 'DEACTIVATE',
          entity: 'Congregation',
          entityId: current.id,
          actor: denominationAuditActor(command.context),
          congregationId: current.id,
          changes: buildAuditChanges(
            { ...current },
            { isActive: command.isActive, acceptsApplications },
            ['isActive', 'acceptsApplications'],
          ),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
    });
    return toCongregationView(
      await requireCongregation(this.congregations, scope, current.id),
    );
  }
}

@Injectable()
export class SetAcceptsApplicationsUseCase {
  constructor(
    @Inject(CONGREGATION_REPOSITORY)
    private readonly congregations: CongregationRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: CongregationCommand & {
      id: number;
      acceptsApplications: boolean;
    },
  ): Promise<CongregationView> {
    const scope = denominationScopeOf(command.context);
    const current = await requireCongregation(
      this.congregations,
      scope,
      command.id,
    );
    if (command.acceptsApplications && !current.isActive) {
      throw new ConflictDomainException(
        'La sede está inactiva: actívala antes de abrir inscripciones.',
        'CONGREGATION_INACTIVE',
      );
    }
    if (current.acceptsApplications === command.acceptsApplications) {
      return toCongregationView(current);
    }

    await this.transactions.run(async (transaction) => {
      await this.congregations.patch(
        scope,
        current.id,
        { acceptsApplications: command.acceptsApplications },
        transaction,
      );
      await this.audit.record(
        {
          action: 'UPDATE',
          entity: 'Congregation',
          entityId: current.id,
          actor: denominationAuditActor(command.context),
          congregationId: current.id,
          changes: buildAuditChanges(
            { ...current },
            { acceptsApplications: command.acceptsApplications },
            ['acceptsApplications'],
          ),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
    });
    return toCongregationView(
      await requireCongregation(this.congregations, scope, current.id),
    );
  }
}
