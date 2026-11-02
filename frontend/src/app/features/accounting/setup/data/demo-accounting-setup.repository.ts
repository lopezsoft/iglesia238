import { Injectable, inject } from '@angular/core';
import { Observable, defer, map } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { accountDepth, accountHasChildren, accountsInTreeOrder, monthLabel, yearMonthOf } from '../../data/accounting-rules';
import { AccountingTenant, readTenant, requirePermission } from '../../data/accounting-tenant';
import { Account, CONTRIBUTION_CATEGORIES, ContributionType, Fund } from '../../data/accounting.models';
import {
  AccountRow,
  ContributionTypeRow,
  FundRow,
  SaveAccountCommand,
  SaveContributionTypeCommand,
  SaveFundCommand,
  SetupOverview,
} from './accounting-setup.models';
import { AccountingSetupRepository } from './accounting-setup.repository';

const MANAGE = 'budgets.manage';
const ACCOUNT_CODE = /^\d{1,20}$/;
const TYPE_CODE = /^[A-Z0-9_]{2,30}$/;

/** Demo adapter of the accounting setup over the shared AccountingDemoStore. */
@Injectable()
export class DemoAccountingSetupRepository extends AccountingSetupRepository {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AccountingDemoStore);
  private readonly db = inject(DemoDatabase);

  private get year(): number {
    return yearMonthOf(this.store.today).year;
  }

  overview(): Observable<SetupOverview> {
    return this.read((tenant) => {
      const funds = this.fundRows(tenant);
      const active = funds.filter((f) => f.isActive);
      const period = tenant.congregationId === null ? undefined : this.store.periodFor(tenant.congregationId, this.store.today);
      return {
        year: this.year,
        activeFunds: active.length,
        totalFunds: funds.length,
        openingTotal: active.reduce((sum, f) => sum + f.openingBalance, 0),
        currentPeriod: period
          ? { year: period.year, month: period.month, status: period.status, label: monthLabel(period) }
          : null,
        congregationScoped: tenant.congregationId !== null,
        scopeLabel:
          tenant.congregationId === null ? 'todas las sedes' : this.store.congregationName(tenant.congregationId),
      };
    });
  }

  listFunds(): Observable<FundRow[]> {
    return this.read((tenant) => this.fundRows(tenant));
  }

  saveFund(command: SaveFundCommand): Observable<FundRow> {
    return demoCommand(() => {
      const tenant = requirePermission(this.auth, MANAGE, 'administrar fondos');
      const name = command.name.trim();
      if (name.length < 3 || name.length > 120) {
        throw new DomainError('INVALID_NAME', 'El nombre del fondo debe tener entre 3 y 120 caracteres.');
      }
      const duplicate = this.store.funds.some(
        (f) => f.denominationId === tenant.denominationId && f.id !== command.id && sameText(f.name, name),
      );
      if (duplicate) {
        throw new DomainError('FUND_NAME_TAKEN', 'Ya existe un fondo con ese nombre en la denominación.');
      }
      const existing = command.id === null ? undefined : this.requireFund(tenant, command.id);
      if (existing?.isActive && !command.isActive && this.isDefaultFundOfActiveAccount(existing.id)) {
        // Contributions, consolidations and tithe settlements post to the account's suggested fund.
        throw new DomainError(
          'FUND_IS_DEFAULT',
          'El fondo es el fondo sugerido de cuentas activas: cambia el fondo sugerido de esas cuentas antes de desactivarlo.',
        );
      }
      const fund: Fund = existing
        ? this.store.replace(this.store.funds, { ...existing, name, isActive: command.isActive })
        : this.pushFund({ id: this.store.nextId(this.store.funds), denominationId: tenant.denominationId, name, isActive: command.isActive });
      if (command.openingBalance !== null) {
        this.setOpeningBalance(tenant, fund.id, command.openingBalance);
      }
      this.audit(tenant, 'Fund', fund.id, existing ? 'FUND_UPDATED' : 'FUND_CREATED', {
        isActive: { from: existing?.isActive ?? null, to: fund.isActive },
        ...(command.openingBalance !== null ? { openingBalance: { from: null, to: command.openingBalance } } : {}),
      });
      return this.fundRows(tenant).find((row) => row.id === fund.id)!;
    });
  }

  deleteFund(id: number): Observable<void> {
    return demoCommand(() => {
      const tenant = requirePermission(this.auth, MANAGE, 'eliminar fondos');
      const fund = this.requireFund(tenant, id);
      if (this.fundInUse(fund.id)) {
        throw new DomainError('FUND_IN_USE', 'El fondo tiene movimientos, presupuesto o saldos: desactívalo en lugar de eliminarlo.');
      }
      this.store.funds.splice(this.store.funds.indexOf(fund), 1);
      this.removeOpeningBalances(fund.id);
      this.audit(tenant, 'Fund', fund.id, 'FUND_DELETED', { isActive: { from: fund.isActive, to: null } });
    });
  }

  listAccounts(): Observable<AccountRow[]> {
    return this.read((tenant) => this.accountRows(tenant));
  }

  saveAccount(command: SaveAccountCommand): Observable<AccountRow> {
    return demoCommand(() => {
      const tenant = requirePermission(this.auth, MANAGE, 'administrar el plan de cuentas');
      const account = command.id === null ? this.createAccount(tenant, command) : this.updateAccount(tenant, command);
      return this.accountRows(tenant).find((row) => row.id === account.id)!;
    });
  }

  deleteAccount(id: number): Observable<void> {
    return demoCommand(() => {
      const tenant = requirePermission(this.auth, MANAGE, 'eliminar cuentas');
      const account = this.requireAccount(tenant, id);
      if (accountHasChildren(this.store.accounts, account.id)) {
        throw new DomainError('ACCOUNT_HAS_CHILDREN', 'La cuenta tiene subcuentas: elimínalas primero.');
      }
      if (this.store.accountHasMovements(account.id)) {
        throw new DomainError('ACCOUNT_HAS_MOVEMENTS', 'La cuenta tiene movimientos o presupuesto y no se puede eliminar.');
      }
      if (this.store.contributionTypes.some((t) => t.accountId === account.id)) {
        throw new DomainError('ACCOUNT_IN_USE', 'La cuenta está asociada a un tipo de aporte.');
      }
      this.store.accounts.splice(this.store.accounts.indexOf(account), 1);
      this.audit(tenant, 'Account', account.id, 'ACCOUNT_DELETED', { code: { from: account.code, to: null } });
    });
  }

  listContributionTypes(): Observable<ContributionTypeRow[]> {
    return this.read((tenant) => this.typeRows(tenant));
  }

  saveContributionType(command: SaveContributionTypeCommand): Observable<ContributionTypeRow> {
    return demoCommand(() => {
      const tenant = requirePermission(this.auth, MANAGE, 'administrar tipos de aporte');
      const code = command.code.trim().toUpperCase();
      const name = command.name.trim();
      if (!TYPE_CODE.test(code)) {
        throw new DomainError('TYPE_CODE_INVALID', 'El código usa de 2 a 30 letras mayúsculas, números o guion bajo.');
      }
      if (name.length < 3 || name.length > 100) {
        throw new DomainError('INVALID_NAME', 'El nombre debe tener entre 3 y 100 caracteres.');
      }
      if (!CONTRIBUTION_CATEGORIES.includes(command.category)) {
        throw new DomainError('INVALID_CATEGORY', 'La categoría no es válida.');
      }
      const taken = this.store.contributionTypes.some(
        (t) => t.denominationId === tenant.denominationId && t.id !== command.id && t.code === code,
      );
      if (taken) {
        throw new DomainError('TYPE_CODE_TAKEN', 'Ya existe un tipo de aporte con ese código.');
      }
      const account = this.store.account(tenant.denominationId, command.accountId);
      if (!account || !account.isPostable || !account.isActive || account.nature !== 'INCOME') {
        throw new DomainError('TYPE_ACCOUNT_INVALID', 'La cuenta debe ser una cuenta imputable de ingreso.');
      }
      const existing = command.id === null ? undefined : this.requireType(tenant, command.id);
      if (existing && existing.category !== command.category && this.hasContributions(existing.id)) {
        throw new DomainError('TYPE_IN_USE', 'El tipo ya tiene aportes: su categoría no se puede cambiar.');
      }
      const row: ContributionType = existing
        ? this.store.replace(this.store.contributionTypes, { ...existing, code, name, category: command.category, accountId: account.id })
        : this.pushType({
            id: this.store.nextId(this.store.contributionTypes),
            denominationId: tenant.denominationId,
            category: command.category,
            code,
            name,
            accountId: account.id,
            isActive: true,
          });
      this.audit(tenant, 'ContributionType', row.id, existing ? 'CONTRIBUTION_TYPE_UPDATED' : 'CONTRIBUTION_TYPE_CREATED', {
        category: { from: existing?.category ?? null, to: row.category },
        accountId: { from: existing?.accountId ?? null, to: row.accountId },
      });
      return this.typeRows(tenant).find((t) => t.id === row.id)!;
    });
  }

  setContributionTypeActive(id: number, isActive: boolean): Observable<ContributionTypeRow> {
    return demoCommand(() => {
      const tenant = requirePermission(this.auth, MANAGE, 'activar o desactivar tipos de aporte');
      const type = this.requireType(tenant, id);
      this.store.replace(this.store.contributionTypes, { ...type, isActive });
      this.audit(tenant, 'ContributionType', id, 'CONTRIBUTION_TYPE_UPDATED', {
        isActive: { from: type.isActive, to: isActive },
      });
      return this.typeRows(tenant).find((t) => t.id === id)!;
    });
  }

  // --- Accounts ------------------------------------------------------------------------------------

  private createAccount(tenant: AccountingTenant, command: SaveAccountCommand): Account {
    const code = this.validCode(tenant, command.code, null);
    const name = this.validAccountName(command.name);
    const parent = command.parentId === null ? undefined : this.requireAccount(tenant, command.parentId);
    if (parent) {
      this.checkChildOf(parent, code, command.nature);
      if (parent.isPostable) {
        this.turnIntoGroup(parent);
      }
    }
    this.checkDefaultFund(tenant, command.defaultFundId);
    const account: Account = {
      id: this.store.nextId(this.store.accounts),
      denominationId: tenant.denominationId,
      defaultFundId: command.defaultFundId,
      parentId: parent?.id ?? null,
      code,
      legacyCode: null,
      name,
      nature: parent?.nature ?? command.nature,
      isPostable: command.isPostable,
      isActive: true,
    };
    this.store.accounts.push(account);
    this.audit(tenant, 'Account', account.id, 'ACCOUNT_CREATED', {
      code: { from: null, to: account.code },
      isPostable: { from: null, to: account.isPostable },
    });
    return account;
  }

  private updateAccount(tenant: AccountingTenant, command: SaveAccountCommand): Account {
    const account = this.requireAccount(tenant, command.id!);
    const name = this.validAccountName(command.name);
    const code = command.code.trim();
    const hasChildren = accountHasChildren(this.store.accounts, account.id);
    const hasMovements = this.store.cashTransactions.some((tx) => tx.accountId === account.id);
    if (code !== account.code) {
      if (hasChildren || hasMovements) {
        throw new DomainError('ACCOUNT_CODE_LOCKED', 'El código no se puede cambiar: la cuenta tiene subcuentas o movimientos.');
      }
      this.validCode(tenant, code, account.id);
      const parent = account.parentId === null ? undefined : this.store.account(tenant.denominationId, account.parentId);
      if (parent) {
        this.checkChildOf(parent, code, account.nature);
      }
    }
    if (command.isPostable && hasChildren) {
      throw new DomainError('ACCOUNT_HAS_CHILDREN', 'Una cuenta con subcuentas no puede ser imputable.');
    }
    if (!command.isPostable && account.isPostable) {
      this.checkCanBeGroup(account);
    }
    this.checkDefaultFund(tenant, command.defaultFundId);
    const updated = this.store.replace(this.store.accounts, {
      ...account,
      code,
      name,
      isPostable: command.isPostable,
      defaultFundId: command.defaultFundId,
    });
    this.audit(tenant, 'Account', account.id, 'ACCOUNT_UPDATED', {
      code: { from: account.code, to: updated.code },
      isPostable: { from: account.isPostable, to: updated.isPostable },
    });
    return updated;
  }

  private validCode(tenant: AccountingTenant, rawCode: string, exceptId: number | null): string {
    const code = rawCode.trim();
    if (!ACCOUNT_CODE.test(code)) {
      throw new DomainError('ACCOUNT_CODE_INVALID', 'El código de la cuenta solo admite números (máximo 20).');
    }
    const taken = this.store.accounts.some(
      (a) => a.denominationId === tenant.denominationId && a.id !== exceptId && a.code === code,
    );
    if (taken) {
      throw new DomainError('ACCOUNT_CODE_TAKEN', 'Ya existe una cuenta con ese código en la denominación.');
    }
    return code;
  }

  private validAccountName(rawName: string): string {
    const name = rawName.trim();
    if (name.length < 3 || name.length > 150) {
      throw new DomainError('INVALID_NAME', 'El nombre de la cuenta debe tener entre 3 y 150 caracteres.');
    }
    return name;
  }

  private checkChildOf(parent: Account, code: string, nature: Account['nature']): void {
    if (!code.startsWith(parent.code) || code.length <= parent.code.length) {
      throw new DomainError('ACCOUNT_CODE_PREFIX', 'El código debe empezar por el código de la cuenta padre.');
    }
    if (nature !== parent.nature) {
      throw new DomainError('ACCOUNT_NATURE_MISMATCH', 'La naturaleza de la subcuenta debe ser la de la cuenta padre.');
    }
  }

  /** A postable account that receives a child becomes a group, if nothing depends on it. */
  private turnIntoGroup(parent: Account): void {
    this.checkCanBeGroup(parent);
    this.store.replace(this.store.accounts, { ...parent, isPostable: false });
  }

  private checkCanBeGroup(account: Account): void {
    if (this.store.cashTransactions.some((tx) => tx.accountId === account.id)) {
      throw new DomainError('ACCOUNT_HAS_MOVEMENTS', 'La cuenta tiene movimientos: debe seguir siendo imputable.');
    }
    if (this.store.contributionTypes.some((t) => t.accountId === account.id)) {
      throw new DomainError('ACCOUNT_IN_USE', 'La cuenta está asociada a un tipo de aporte: debe seguir siendo imputable.');
    }
  }

  private checkDefaultFund(tenant: AccountingTenant, fundId: number | null): void {
    if (fundId !== null && !this.store.fund(tenant.denominationId, fundId)) {
      throw new DomainError('FUND_NOT_FOUND', 'El fondo sugerido no existe en la denominación.');
    }
  }

  // --- Rows ----------------------------------------------------------------------------------------

  private fundRows(tenant: AccountingTenant): FundRow[] {
    const year = this.year;
    return this.store.funds
      .filter((f) => f.denominationId === tenant.denominationId)
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.id - b.id)
      .map((fund) => {
        const balances = this.store.fundOpeningBalances.filter(
          (b) =>
            b.fundId === fund.id &&
            b.year === year &&
            (tenant.congregationId === null || b.congregationId === tenant.congregationId),
        );
        return {
          ...fund,
          openingBalance: balances.reduce((sum, b) => sum + b.amount, 0),
          openingLocked:
            tenant.congregationId === null || this.hasMovementsInYear(tenant.congregationId, fund.id, year),
          inUse: this.fundInUse(fund.id),
        };
      });
  }

  private accountRows(tenant: AccountingTenant): AccountRow[] {
    const accounts = this.store.accounts.filter((a) => a.denominationId === tenant.denominationId);
    return accountsInTreeOrder(accounts).map((account) => ({
      ...account,
      depth: accountDepth(accounts, account),
      hasChildren: accountHasChildren(accounts, account.id),
      hasMovements: this.store.accountHasMovements(account.id),
      linkedTypes: this.store.contributionTypes.filter((t) => t.accountId === account.id).length,
      defaultFundName:
        account.defaultFundId === null ? null : (this.store.fund(tenant.denominationId, account.defaultFundId)?.name ?? null),
    }));
  }

  private typeRows(tenant: AccountingTenant): ContributionTypeRow[] {
    return this.store.contributionTypes
      .filter((t) => t.denominationId === tenant.denominationId)
      .map((type) => {
        const account = this.store.account(tenant.denominationId, type.accountId);
        return {
          ...type,
          accountCode: account?.code ?? '—',
          accountName: account?.name ?? '—',
          contributionCount: this.store.contributions.filter((c) => c.contributionTypeId === type.id).length,
        };
      });
  }

  // --- Funds ---------------------------------------------------------------------------------------

  private setOpeningBalance(tenant: AccountingTenant, fundId: number, amount: number): void {
    if (tenant.congregationId === null) {
      throw new DomainError('CONGREGATION_REQUIRED', 'Selecciona una sede para definir el saldo inicial del fondo.');
    }
    if (!Number.isFinite(amount) || amount < 0) {
      throw new DomainError('INVALID_AMOUNT', 'El saldo inicial no puede ser negativo.');
    }
    const year = this.year;
    const balances = this.store.fundOpeningBalances;
    const index = balances.findIndex(
      (b) => b.congregationId === tenant.congregationId && b.fundId === fundId && b.year === year,
    );
    const current = index === -1 ? 0 : balances[index].amount;
    if (current === amount) {
      return;
    }
    if (this.hasMovementsInYear(tenant.congregationId, fundId, year)) {
      throw new DomainError(
        'OPENING_BALANCE_LOCKED',
        'El fondo ya tiene movimientos este año: el saldo inicial solo se ajusta con un comprobante.',
      );
    }
    const row = { denominationId: tenant.denominationId, congregationId: tenant.congregationId, fundId, year, amount };
    if (index === -1) {
      balances.push(row);
    } else {
      balances[index] = row;
    }
  }

  private removeOpeningBalances(fundId: number): void {
    const balances = this.store.fundOpeningBalances;
    for (let i = balances.length - 1; i >= 0; i--) {
      if (balances[i].fundId === fundId) {
        balances.splice(i, 1);
      }
    }
  }

  private hasMovementsInYear(congregationId: number, fundId: number, year: number): boolean {
    return this.store.cashTransactions.some(
      (tx) => tx.congregationId === congregationId && tx.fundId === fundId && tx.postedOn.startsWith(`${year}-`),
    );
  }

  private fundInUse(fundId: number): boolean {
    return (
      this.store.cashTransactions.some((tx) => tx.fundId === fundId) ||
      this.store.budgetLines.some((line) => line.fundId === fundId) ||
      this.store.accounts.some((a) => a.defaultFundId === fundId) ||
      this.store.fundOpeningBalances.some((b) => b.fundId === fundId && b.amount !== 0)
    );
  }

  private isDefaultFundOfActiveAccount(fundId: number): boolean {
    return this.store.accounts.some((a) => a.defaultFundId === fundId && a.isActive);
  }

  private pushFund(fund: Fund): Fund {
    this.store.funds.push(fund);
    return fund;
  }

  private pushType(type: ContributionType): ContributionType {
    this.store.contributionTypes.push(type);
    return type;
  }

  // --- Lookups and helpers -------------------------------------------------------------------------

  private requireFund(tenant: AccountingTenant, id: number): Fund {
    const fund = this.store.fund(tenant.denominationId, id);
    if (!fund) {
      throw new DomainError('NOT_FOUND', 'El fondo no existe.');
    }
    return fund;
  }

  private requireAccount(tenant: AccountingTenant, id: number): Account {
    const account = this.store.account(tenant.denominationId, id);
    if (!account) {
      throw new DomainError('NOT_FOUND', 'La cuenta no existe.');
    }
    return account;
  }

  private requireType(tenant: AccountingTenant, id: number): ContributionType {
    const type = this.store.contributionType(tenant.denominationId, id);
    if (!type) {
      throw new DomainError('NOT_FOUND', 'El tipo de aporte no existe.');
    }
    return type;
  }

  private hasContributions(typeId: number): boolean {
    return this.store.contributions.some((c) => c.contributionTypeId === typeId);
  }

  private read<T>(project: (tenant: AccountingTenant) => T): Observable<T> {
    return defer(() => demoResponse(readTenant(this.auth))).pipe(map((tenant) => project(tenant)));
  }

  private audit(
    tenant: AccountingTenant,
    entity: string,
    id: number,
    action: string,
    changes: Record<string, { from: string | number | boolean | null; to: string | number | boolean | null }>,
  ): void {
    this.db.audit({
      userId: tenant.userId,
      denominationId: tenant.denominationId,
      congregationId: tenant.congregationId,
      entity,
      entityId: String(id),
      action,
      changes,
    });
  }
}

function sameText(a: string, b: string): boolean {
  return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}
