import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
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
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from './account.repository.js';
import {
  CONTRIBUTION_TYPE_REPOSITORY,
  type ContributionTypeRecord,
  type ContributionTypeRepository,
} from './contribution-type.repository.js';
import {
  CONTRIBUTION_CATEGORIES,
  type ContributionCategoryValue,
  type ContributionTypeRowView,
} from './setup.views.js';

export interface SaveContributionTypeInput {
  readonly code: string;
  readonly name: string;
  readonly category: ContributionCategoryValue;
  readonly accountId: number;
}

const TYPE_CODE = /^[A-Z0-9_]{2,30}$/;

/** Kinds of contribution (tithe, offering, first fruits, vow...) and the income account each one feeds. */
@Injectable()
export class ContributionTypesService {
  constructor(
    @Inject(CONTRIBUTION_TYPE_REPOSITORY)
    private readonly types: ContributionTypeRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async list(tenant: TenantContext): Promise<ContributionTypeRowView[]> {
    const records = await this.types.list(tenant.tenantScope());
    return records.map(toRow);
  }

  async create(
    tenant: TenantContext,
    input: SaveContributionTypeInput,
  ): Promise<ContributionTypeRowView> {
    const scope = tenant.tenantScope();
    const data = await this.validated(scope, input, null);

    const id = await this.transactions.run(async (transaction) => {
      const created = await this.types.create(scope, data, transaction);
      await this.audit.record(
        {
          action: 'CONTRIBUTION_TYPE_CREATED',
          entity: 'ContributionType',
          entityId: created,
          actor: tenant,
          changes: buildAuditChanges(
            null,
            { category: data.category, accountId: data.accountId },
            ['category', 'accountId'],
          ),
        },
        transaction,
      );
      return created;
    });
    return this.rowOf(scope, id);
  }

  async update(
    tenant: TenantContext,
    id: number,
    input: SaveContributionTypeInput,
  ): Promise<ContributionTypeRowView> {
    const scope = tenant.tenantScope();
    const existing = this.orNotFound(await this.types.find(scope, id));
    const data = await this.validated(scope, input, id);
    if (existing.category !== data.category && existing.contributionCount > 0) {
      throw new ConflictDomainException(
        'El tipo ya tiene aportes: su categoría no se puede cambiar.',
        'TYPE_IN_USE',
      );
    }

    await this.transactions.run(async (transaction) => {
      await this.types.update(scope, id, data, transaction);
      await this.audit.record(
        {
          action: 'CONTRIBUTION_TYPE_UPDATED',
          entity: 'ContributionType',
          entityId: id,
          actor: tenant,
          changes: buildAuditChanges(
            { category: existing.category, accountId: existing.accountId },
            { category: data.category, accountId: data.accountId },
            ['category', 'accountId'],
          ),
        },
        transaction,
      );
    });
    return this.rowOf(scope, id);
  }

  async setActive(
    tenant: TenantContext,
    id: number,
    isActive: boolean,
  ): Promise<ContributionTypeRowView> {
    const scope = tenant.tenantScope();
    const existing = this.orNotFound(await this.types.find(scope, id));
    await this.transactions.run(async (transaction) => {
      await this.types.setActive(scope, id, isActive, transaction);
      await this.audit.record(
        {
          action: 'CONTRIBUTION_TYPE_UPDATED',
          entity: 'ContributionType',
          entityId: id,
          actor: tenant,
          changes: buildAuditChanges(
            { isActive: existing.isActive },
            { isActive },
            ['isActive'],
          ),
        },
        transaction,
      );
    });
    return this.rowOf(scope, id);
  }

  private async validated(
    scope: TenantScope,
    input: SaveContributionTypeInput,
    exceptId: number | null,
  ) {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!TYPE_CODE.test(code)) {
      throw new InvalidInputException(
        'El código usa de 2 a 30 letras mayúsculas, números o guion bajo.',
        'TYPE_CODE_INVALID',
      );
    }
    if (name.length < 3 || name.length > 100) {
      throw new InvalidInputException(
        'El nombre debe tener entre 3 y 100 caracteres.',
        'INVALID_NAME',
      );
    }
    if (!CONTRIBUTION_CATEGORIES.includes(input.category)) {
      throw new InvalidInputException(
        'La categoría no es válida.',
        'INVALID_CATEGORY',
      );
    }
    const existing = await this.types.list(scope);
    if (existing.some((type) => type.id !== exceptId && type.code === code)) {
      throw new ConflictDomainException(
        'Ya existe un tipo de aporte con ese código.',
        'TYPE_CODE_TAKEN',
      );
    }
    const account = await this.accounts.find(scope, input.accountId);
    if (
      !account ||
      !account.isPostable ||
      !account.isActive ||
      account.nature !== 'INCOME'
    ) {
      throw new BusinessRuleException(
        'La cuenta debe ser una cuenta imputable de ingreso.',
        'TYPE_ACCOUNT_INVALID',
      );
    }
    return { code, name, category: input.category, accountId: account.id };
  }

  private async rowOf(
    scope: TenantScope,
    id: number,
  ): Promise<ContributionTypeRowView> {
    return toRow(this.orNotFound(await this.types.find(scope, id)));
  }

  private orNotFound(
    record: ContributionTypeRecord | null,
  ): ContributionTypeRecord {
    if (!record) {
      throw new NotFoundDomainException('El tipo de aporte no existe.');
    }
    return record;
  }
}

function toRow(record: ContributionTypeRecord): ContributionTypeRowView {
  return { ...record };
}
