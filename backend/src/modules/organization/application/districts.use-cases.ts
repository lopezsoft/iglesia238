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
  denominationAuditActor,
  denominationScopeOf,
  optionalText,
  requiredText,
  sameText,
} from './organization-rules.js';
import {
  DISTRICT_REPOSITORY,
  type DistrictData,
  type DistrictRecord,
  type DistrictRepository,
} from './organization.ports.js';
import { type DistrictView, toDistrictView } from './organization.views.js';
import { compareSpanish } from '../../../common/text/comparable-text.js';

const NOT_FOUND = 'El distrito no existe en tu denominación.';

export interface DistrictInput {
  readonly number: string;
  readonly name: string | null;
}

export interface DistrictCommand {
  readonly context: TenantContext;
  readonly ipAddress: string | null;
}

async function requireDistrict(
  districts: DistrictRepository,
  scope: TenantScope,
  id: number,
): Promise<DistrictRecord> {
  const row = await districts.findById(scope, id);
  if (!row) {
    throw new NotFoundDomainException(NOT_FOUND);
  }
  return row;
}

/** Number 2 comes before number 10. */
export function sortDistricts<T extends { number: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => compareSpanish(a.number, b.number, true));
}

async function validDistrict(
  districts: DistrictRepository,
  scope: TenantScope,
  input: DistrictInput,
  exceptId: number | null,
): Promise<DistrictData> {
  const number = requiredText(
    input.number,
    'El número del distrito',
    FIELD_LIMITS.districtNumber,
  );
  const existing = await districts.list(scope);
  if (
    existing.some((row) => row.id !== exceptId && sameText(row.number, number))
  ) {
    throw new ConflictDomainException(
      'Ya existe un distrito con ese número en la denominación.',
      'DUPLICATE_DISTRICT_NUMBER',
    );
  }
  return {
    number,
    name: optionalText(input.name, 'El nombre', FIELD_LIMITS.districtName),
  };
}

@Injectable()
export class ListDistrictsUseCase {
  constructor(
    @Inject(DISTRICT_REPOSITORY) private readonly districts: DistrictRepository,
  ) {}

  async execute(context: TenantContext): Promise<DistrictView[]> {
    const rows = await this.districts.list(denominationScopeOf(context));
    return sortDistricts(rows).map(toDistrictView);
  }
}

@Injectable()
export class CreateDistrictUseCase {
  constructor(
    @Inject(DISTRICT_REPOSITORY) private readonly districts: DistrictRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: DistrictCommand & { input: DistrictInput },
  ): Promise<DistrictView> {
    const scope = denominationScopeOf(command.context);
    const data = await validDistrict(
      this.districts,
      scope,
      command.input,
      null,
    );

    const id = await this.transactions.run(async (transaction) => {
      const created = await this.districts.create(scope, data, transaction);
      await this.audit.record(
        {
          action: 'CREATE',
          entity: 'District',
          entityId: created,
          actor: denominationAuditActor(command.context),
          changes: buildAuditChanges(null, { ...data }, ['number']),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
      return created;
    });
    return toDistrictView(await requireDistrict(this.districts, scope, id));
  }
}

@Injectable()
export class UpdateDistrictUseCase {
  constructor(
    @Inject(DISTRICT_REPOSITORY) private readonly districts: DistrictRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    command: DistrictCommand & { id: number; input: DistrictInput },
  ): Promise<DistrictView> {
    const scope = denominationScopeOf(command.context);
    const current = await requireDistrict(this.districts, scope, command.id);
    const data = await validDistrict(
      this.districts,
      scope,
      command.input,
      current.id,
    );

    await this.transactions.run(async (transaction) => {
      await this.districts.update(scope, current.id, data, transaction);
      const changes = buildAuditChanges(
        { number: current.number, name: current.name },
        { ...data },
        ['number', 'name'],
      );
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            action: 'UPDATE',
            entity: 'District',
            entityId: current.id,
            actor: denominationAuditActor(command.context),
            changes,
            ipAddress: command.ipAddress,
          },
          transaction,
        );
      }
    });
    return toDistrictView(
      await requireDistrict(this.districts, scope, current.id),
    );
  }
}
