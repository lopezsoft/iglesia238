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
  type Transaction,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  ACCOUNT_REPOSITORY,
  type AccountFacts,
  type AccountRecord,
  type AccountRepository,
} from './account.repository.js';
import {
  accountDepth,
  accountHasChildren,
  accountsInTreeOrder,
} from './account-tree.js';
import { FUND_REPOSITORY, type FundRepository } from './fund.repository.js';
import type { AccountNatureValue, AccountRowView } from './setup.views.js';

export interface CreateAccountInput {
  readonly parentId: number | null;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNatureValue;
  readonly isPostable: boolean;
  readonly defaultFundId: number | null;
}

/** Parent and nature are fixed once the account exists. */
export interface UpdateAccountInput {
  readonly code: string;
  readonly name: string;
  readonly isPostable: boolean;
  readonly defaultFundId: number | null;
}

const ACCOUNT_CODE = /^\d{1,20}$/;
const NO_FACTS: AccountFacts = {
  hasMovements: false,
  linkedTypes: 0,
  activeLinkedTypes: 0,
};

/** Chart of accounts of the denomination: a tree of groups and postable accounts. */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(FUND_REPOSITORY) private readonly funds: FundRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async list(tenant: TenantContext): Promise<AccountRowView[]> {
    const scope = tenant.tenantScope();
    const [records, facts, funds] = await Promise.all([
      this.accounts.list(scope),
      this.accounts.facts(scope),
      this.funds.list(scope),
    ]);
    const fundNames = new Map(funds.map((fund) => [fund.id, fund.name]));
    return accountsInTreeOrder(records).map((account) =>
      toRow(account, records, facts.get(account.id) ?? NO_FACTS, fundNames),
    );
  }

  async create(
    tenant: TenantContext,
    input: CreateAccountInput,
  ): Promise<AccountRowView> {
    const scope = tenant.tenantScope();
    const all = await this.accounts.list(scope);
    const facts = await this.accounts.facts(scope);
    const code = this.validCode(all, input.code, null);
    const name = this.validName(input.name);
    const parent =
      input.parentId === null
        ? null
        : this.orNotFound(
            all.find((account) => account.id === input.parentId),
            'La cuenta padre no existe.',
          );
    if (parent) {
      this.checkChildOf(parent, code, input.nature);
    }
    await this.checkDefaultFund(scope, input.defaultFundId);
    if (parent?.isPostable) {
      this.checkCanBeGroup(facts.get(parent.id) ?? NO_FACTS);
    }

    const created = await this.transactions.run(async (transaction) => {
      if (parent?.isPostable) {
        await this.accounts.update(
          scope,
          parent.id,
          { isPostable: false },
          transaction,
        );
      }
      const account = await this.accounts.create(
        scope,
        {
          parentId: parent?.id ?? null,
          code,
          name,
          nature: parent?.nature ?? input.nature,
          isPostable: input.isPostable,
          defaultFundId: input.defaultFundId,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'ACCOUNT_CREATED',
          entity: 'Account',
          entityId: account.id,
          actor: tenant,
          changes: buildAuditChanges(
            null,
            { code: account.code, isPostable: account.isPostable },
            ['code', 'isPostable'],
          ),
        },
        transaction,
      );
      return account;
    });
    return this.rowOf(scope, created.id);
  }

  async update(
    tenant: TenantContext,
    id: number,
    input: UpdateAccountInput,
  ): Promise<AccountRowView> {
    const scope = tenant.tenantScope();
    const all = await this.accounts.list(scope);
    const account = this.orNotFound(all.find((a) => a.id === id));
    const facts = (await this.accounts.facts(scope)).get(id) ?? NO_FACTS;
    const name = this.validName(input.name);
    const code = input.code.trim();
    const hasChildren = accountHasChildren(all, id);

    if (code !== account.code) {
      if (hasChildren || facts.hasMovements) {
        throw new ConflictDomainException(
          'El código no se puede cambiar: la cuenta tiene subcuentas o movimientos.',
          'ACCOUNT_CODE_LOCKED',
        );
      }
      this.validCode(all, code, id);
      const parent = all.find((a) => a.id === account.parentId);
      if (parent) {
        this.checkChildOf(parent, code, account.nature);
      }
    }
    if (input.isPostable && hasChildren) {
      throw new ConflictDomainException(
        'Una cuenta con subcuentas no puede ser imputable.',
        'ACCOUNT_HAS_CHILDREN',
      );
    }
    if (!input.isPostable && account.isPostable) {
      this.checkCanBeGroup(facts);
    }
    await this.checkDefaultFund(scope, input.defaultFundId);

    await this.transactions.run(async (transaction) => {
      const updated = await this.accounts.update(
        scope,
        id,
        {
          code,
          name,
          isPostable: input.isPostable,
          defaultFundId: input.defaultFundId,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'ACCOUNT_UPDATED',
          entity: 'Account',
          entityId: id,
          actor: tenant,
          changes: buildAuditChanges(
            { code: account.code, isPostable: account.isPostable },
            { code: updated.code, isPostable: updated.isPostable },
            ['code', 'isPostable'],
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
  ): Promise<AccountRowView> {
    const scope = tenant.tenantScope();
    const account = this.orNotFound(await this.accounts.find(scope, id));
    if (!isActive) {
      const facts = (await this.accounts.facts(scope)).get(id) ?? NO_FACTS;
      if (facts.activeLinkedTypes > 0) {
        throw new ConflictDomainException(
          'La cuenta está asociada a tipos de aporte activos: desactívalos o cámbiales la cuenta primero.',
          'ACCOUNT_IN_USE',
        );
      }
    }
    await this.transactions.run(async (transaction) => {
      await this.accounts.update(scope, id, { isActive }, transaction);
      await this.audit.record(
        {
          action: 'ACCOUNT_UPDATED',
          entity: 'Account',
          entityId: id,
          actor: tenant,
          changes: buildAuditChanges(
            { isActive: account.isActive },
            { isActive },
            ['isActive'],
          ),
        },
        transaction,
      );
    });
    return this.rowOf(scope, id);
  }

  async remove(tenant: TenantContext, id: number): Promise<void> {
    const scope = tenant.tenantScope();
    const all = await this.accounts.list(scope);
    const account = this.orNotFound(all.find((a) => a.id === id));
    const facts = (await this.accounts.facts(scope)).get(id) ?? NO_FACTS;
    if (accountHasChildren(all, id)) {
      throw new ConflictDomainException(
        'La cuenta tiene subcuentas: elimínalas primero.',
        'ACCOUNT_HAS_CHILDREN',
      );
    }
    if (facts.hasMovements) {
      throw new ConflictDomainException(
        'La cuenta tiene movimientos o presupuesto y no se puede eliminar.',
        'ACCOUNT_HAS_MOVEMENTS',
      );
    }
    if (facts.linkedTypes > 0) {
      throw new ConflictDomainException(
        'La cuenta está asociada a un tipo de aporte.',
        'ACCOUNT_IN_USE',
      );
    }
    await this.transactions.run(async (transaction) => {
      await this.accounts.delete(scope, id, transaction);
      await this.audit.record(
        {
          action: 'ACCOUNT_DELETED',
          entity: 'Account',
          entityId: id,
          actor: tenant,
          changes: { code: { from: account.code, to: null } },
        },
        transaction,
      );
    });
  }

  // --- Rules ---------------------------------------------------------------------------------------

  private validCode(
    all: readonly AccountRecord[],
    raw: string,
    exceptId: number | null,
  ): string {
    const code = raw.trim();
    if (!ACCOUNT_CODE.test(code)) {
      throw new InvalidInputException(
        'El código de la cuenta solo admite números (máximo 20).',
        'ACCOUNT_CODE_INVALID',
      );
    }
    if (all.some((a) => a.id !== exceptId && a.code === code)) {
      throw new ConflictDomainException(
        'Ya existe una cuenta con ese código en la denominación.',
        'ACCOUNT_CODE_TAKEN',
      );
    }
    return code;
  }

  private validName(raw: string): string {
    const name = raw.trim();
    if (name.length < 3 || name.length > 150) {
      throw new InvalidInputException(
        'El nombre de la cuenta debe tener entre 3 y 150 caracteres.',
        'INVALID_NAME',
      );
    }
    return name;
  }

  private checkChildOf(
    parent: AccountRecord,
    code: string,
    nature: AccountNatureValue,
  ): void {
    if (!code.startsWith(parent.code) || code.length <= parent.code.length) {
      throw new InvalidInputException(
        'El código debe empezar por el código de la cuenta padre.',
        'ACCOUNT_CODE_PREFIX',
      );
    }
    if (nature !== parent.nature) {
      throw new BusinessRuleException(
        'La naturaleza de la subcuenta debe ser la de la cuenta padre.',
        'ACCOUNT_NATURE_MISMATCH',
      );
    }
  }

  /** A postable account that becomes a group must not carry movements nor contribution types. */
  private checkCanBeGroup(facts: AccountFacts): void {
    if (facts.hasMovements) {
      throw new ConflictDomainException(
        'La cuenta tiene movimientos: debe seguir siendo imputable.',
        'ACCOUNT_HAS_MOVEMENTS',
      );
    }
    if (facts.linkedTypes > 0) {
      throw new ConflictDomainException(
        'La cuenta está asociada a un tipo de aporte: debe seguir siendo imputable.',
        'ACCOUNT_IN_USE',
      );
    }
  }

  private async checkDefaultFund(
    scope: TenantScope,
    fundId: number | null,
    transaction?: Transaction,
  ): Promise<void> {
    if (
      fundId !== null &&
      !(await this.funds.find(scope, fundId, transaction))
    ) {
      throw new NotFoundDomainException(
        'El fondo sugerido no existe en la denominación.',
        'FUND_NOT_FOUND',
      );
    }
  }

  private async rowOf(scope: TenantScope, id: number): Promise<AccountRowView> {
    const [records, facts, funds] = await Promise.all([
      this.accounts.list(scope),
      this.accounts.facts(scope),
      this.funds.list(scope),
    ]);
    const account = this.orNotFound(records.find((a) => a.id === id));
    return toRow(
      account,
      records,
      facts.get(id) ?? NO_FACTS,
      new Map(funds.map((fund) => [fund.id, fund.name])),
    );
  }

  private orNotFound<T>(value: T | null | undefined, message?: string): T {
    if (value === null || value === undefined) {
      throw new NotFoundDomainException(message ?? 'La cuenta no existe.');
    }
    return value;
  }
}

function toRow(
  account: AccountRecord,
  all: readonly AccountRecord[],
  facts: AccountFacts,
  fundNames: ReadonlyMap<number, string>,
): AccountRowView {
  return {
    ...account,
    depth: accountDepth(all, account),
    hasChildren: accountHasChildren(all, account.id),
    hasMovements: facts.hasMovements,
    linkedTypes: facts.linkedTypes,
    defaultFundName:
      account.defaultFundId === null
        ? null
        : (fundNames.get(account.defaultFundId) ?? null),
  };
}
