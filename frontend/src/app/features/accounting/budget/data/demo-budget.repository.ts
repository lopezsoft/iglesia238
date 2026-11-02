import { Injectable, inject } from '@angular/core';
import { Observable, defer, map } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { roundMoney } from '../../data/accounting-rules';
import { AccountingTenant, requirePermission, writeTenant } from '../../data/accounting-tenant';
import { BUDGET_TYPES, Budget, BudgetLine, BudgetType } from '../../data/accounting.models';
import { budgetTotals, executedAmount, executionPct, expectedExecutionPct } from './budget-execution';
import { BudgetLineRow, BudgetOverview, BudgetView, CommitteeGroup, SaveBudgetLineCommand } from './budget.models';
import { BudgetRepository } from './budget.repository';

const PERMISSION = 'budgets.manage';
const MAX_AMOUNT = 999_999_999_999.99;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

type SedeTenant = AccountingTenant & { readonly congregationId: number };

/**
 * Demo adapter of the budget over the shared AccountingDemoStore. One line per account and fund
 * in each budget (on a committee budget the fund is the committee); the execution comes from the
 * cash book; closed budgets are read-only.
 */
@Injectable()
export class DemoBudgetRepository extends BudgetRepository {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AccountingDemoStore);
  private readonly db = inject(DemoDatabase);

  overview(requestedYear: number | null): Observable<BudgetOverview> {
    return defer(() => demoResponse(requirePermission(this.auth, PERMISSION, 'consultar el presupuesto'))).pipe(
      map((tenant) => {
        const today = this.store.today;
        const currentYear = Number(today.slice(0, 4));
        const year = requestedYear ?? currentYear;
        const congregationId = tenant.congregationId;
        const budgetYears =
          congregationId === null
            ? []
            : this.store.budgets.filter((b) => b.denominationId === tenant.denominationId && b.congregationId === congregationId).map((b) => b.year);
        const empty = (type: BudgetType): BudgetView => ({ type, budgetId: null, status: null, lines: [], totals: budgetTotals([]), groups: [] });
        return {
          today,
          year,
          years: [...new Set([...budgetYears, currentYear, currentYear + 1, year])].sort((a, b) => b - a),
          congregationScoped: congregationId !== null,
          congregationName: congregationId === null ? 'todas las sedes' : this.store.congregationName(congregationId),
          expectedPct: expectedExecutionPct(year, today),
          cutoffLabel: cutoffLabel(year, today),
          fixed: congregationId === null ? empty('FIXED') : this.view({ ...tenant, congregationId }, year, 'FIXED'),
          committee: congregationId === null ? empty('COMMITTEE') : this.view({ ...tenant, congregationId }, year, 'COMMITTEE'),
          accounts: this.store
            .postableAccounts(tenant.denominationId)
            .map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` })),
          funds: this.store.funds
            .filter((f) => f.denominationId === tenant.denominationId && f.isActive)
            .map((f) => ({ id: f.id, label: f.name })),
        };
      }),
    );
  }

  saveLine(command: SaveBudgetLineCommand): Observable<BudgetLineRow> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'administrar el presupuesto');
      if (!BUDGET_TYPES.includes(command.type)) {
        throw new DomainError('INVALID_BUDGET_TYPE', 'El tipo de presupuesto no es válido.');
      }
      if (!Number.isInteger(command.year) || command.year < MIN_YEAR || command.year > MAX_YEAR) {
        throw new DomainError('INVALID_YEAR', 'El año del presupuesto no es válido.');
      }
      const annualAmount = roundMoney(command.annualAmount);
      if (!Number.isFinite(annualAmount) || annualAmount <= 0 || annualAmount > MAX_AMOUNT) {
        throw new DomainError('INVALID_AMOUNT', 'El valor anual debe ser mayor que cero.');
      }
      const monthlyAmount = command.monthlyAmount === null ? null : roundMoney(command.monthlyAmount);
      if (monthlyAmount !== null && (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || monthlyAmount > annualAmount)) {
        throw new DomainError('INVALID_MONTHLY_AMOUNT', 'El valor mensual debe ser mayor que cero y no superar el anual.');
      }
      const account = this.store.account(tenant.denominationId, command.accountId);
      if (!account || !account.isPostable || !account.isActive) {
        throw new DomainError('ACCOUNT_NOT_POSTABLE', 'Selecciona una cuenta imputable activa.');
      }
      const fund = this.store.fund(tenant.denominationId, command.fundId);
      if (!fund || !fund.isActive) {
        throw new DomainError('FUND_INACTIVE', 'El fondo o comité no existe o está inactivo.');
      }

      const existing = command.id === null ? undefined : this.lineInScope(tenant, command.id);
      if (command.id !== null && !existing) {
        throw new DomainError('NOT_FOUND', 'La línea no existe en el presupuesto de la sede.');
      }
      const budget = existing
        ? this.store.budgets.find((b) => b.id === existing.budgetId)!
        : this.findBudget(tenant, command.year, command.type);
      if (budget && (budget.year !== command.year || budget.type !== command.type)) {
        throw new DomainError('NOT_FOUND', 'La línea no pertenece a ese presupuesto.');
      }
      if (budget?.status === 'CLOSED') {
        throw new DomainError('BUDGET_CLOSED', `El presupuesto ${command.year} está cerrado: solo lectura.`);
      }
      const duplicate =
        budget &&
        this.store.budgetLines.some(
          (l) => l.budgetId === budget.id && l.accountId === account.id && l.fundId === fund.id && l.id !== command.id,
        );
      if (duplicate) {
        throw new DomainError(
          'DUPLICATE_BUDGET_LINE',
          `Ya existe una línea para ${account.code} · ${fund.name} en el presupuesto ${command.year}. Ajusta la línea existente en lugar de duplicarla.`,
        );
      }

      const target = budget ?? this.createBudget(tenant, command.year, command.type);
      const line: BudgetLine = {
        id: existing?.id ?? this.store.nextId(this.store.budgetLines),
        denominationId: tenant.denominationId,
        budgetId: target.id,
        accountId: account.id,
        fundId: fund.id,
        monthlyAmount,
        annualAmount,
      };
      if (existing) {
        this.store.replace(this.store.budgetLines, line);
      } else {
        this.store.budgetLines.push(line);
      }
      this.audit(tenant, line.id, existing ? 'BUDGET_LINE_UPDATED' : 'BUDGET_LINE_CREATED', {
        budget: { from: null, to: `${target.type} ${target.year}` },
        account: { from: null, to: account.code },
        annualAmount: { from: existing?.annualAmount ?? null, to: annualAmount },
        monthlyAmount: { from: existing?.monthlyAmount ?? null, to: monthlyAmount },
      });
      return this.toRow(tenant, line, this.store.budgetLines.filter((l) => l.budgetId === target.id));
    });
  }

  deleteLine(lineId: number): Observable<void> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'administrar el presupuesto');
      const line = this.lineInScope(tenant, lineId);
      if (!line) {
        throw new DomainError('NOT_FOUND', 'La línea no existe en el presupuesto de la sede.');
      }
      const budget = this.store.budgets.find((b) => b.id === line.budgetId)!;
      if (budget.status === 'CLOSED') {
        throw new DomainError('BUDGET_CLOSED', `El presupuesto ${budget.year} está cerrado: solo lectura.`);
      }
      this.store.budgetLines.splice(this.store.budgetLines.indexOf(line), 1);
      this.audit(tenant, line.id, 'BUDGET_LINE_DELETED', {
        budget: { from: `${budget.type} ${budget.year}`, to: null },
        annualAmount: { from: line.annualAmount, to: null },
      });
    });
  }

  // --- Projections -----------------------------------------------------------------------------------

  private view(tenant: SedeTenant, year: number, type: BudgetType): BudgetView {
    const budget = this.findBudget(tenant, year, type);
    const lines = budget ? this.store.budgetLines.filter((l) => l.budgetId === budget.id) : [];
    const rows = lines
      .map((line) => this.toRow(tenant, line, lines))
      .sort((a, b) => a.fundName.localeCompare(b.fundName) || a.accountCode.localeCompare(b.accountCode));
    return {
      type,
      budgetId: budget?.id ?? null,
      status: budget?.status ?? null,
      lines: rows,
      totals: budgetTotals(rows),
      groups: type === 'COMMITTEE' ? groupByCommittee(rows) : [],
    };
  }

  private toRow(tenant: SedeTenant, line: BudgetLine, siblings: readonly BudgetLine[]): BudgetLineRow {
    const budget = this.store.budgets.find((b) => b.id === line.budgetId)!;
    const account = this.store.account(tenant.denominationId, line.accountId);
    const nature = account?.nature ?? 'EXPENSE';
    const executed = executedAmount(this.store.cashTransactions, {
      congregationId: tenant.congregationId,
      accountId: line.accountId,
      fundId: line.fundId,
      year: budget.year,
      nature,
    });
    const pct = executionPct(executed, line.annualAmount);
    const fundName = (fundId: number) => this.store.fund(tenant.denominationId, fundId)?.name ?? '—';
    return {
      id: line.id,
      budgetId: line.budgetId,
      accountId: line.accountId,
      accountCode: account?.code ?? '—',
      accountName: account?.name ?? '—',
      nature,
      fundId: line.fundId,
      fundName: fundName(line.fundId),
      monthlyAmount: line.monthlyAmount,
      annualAmount: line.annualAmount,
      executed,
      executionPct: pct,
      overExecuted: pct > 100,
      difference: roundMoney(line.annualAmount - executed),
      sharedWith:
        budget.type === 'COMMITTEE'
          ? siblings.filter((s) => s.accountId === line.accountId && s.fundId !== line.fundId).map((s) => fundName(s.fundId))
          : [],
    };
  }

  private findBudget(tenant: SedeTenant, year: number, type: BudgetType): Budget | undefined {
    return this.store.budgets.find(
      (b) =>
        b.denominationId === tenant.denominationId &&
        b.congregationId === tenant.congregationId &&
        b.year === year &&
        b.type === type,
    );
  }

  private createBudget(tenant: SedeTenant, year: number, type: BudgetType): Budget {
    const budget: Budget = {
      id: this.store.nextId(this.store.budgets),
      denominationId: tenant.denominationId,
      congregationId: tenant.congregationId,
      year,
      type,
      incomeIncreaseRate: null,
      status: 'DRAFT',
    };
    this.store.budgets.push(budget);
    return budget;
  }

  private lineInScope(tenant: SedeTenant, lineId: number): BudgetLine | undefined {
    const line = this.store.budgetLines.find((l) => l.id === lineId && l.denominationId === tenant.denominationId);
    const budget = line ? this.store.budgets.find((b) => b.id === line.budgetId) : undefined;
    return budget?.congregationId === tenant.congregationId ? line : undefined;
  }

  private audit(
    tenant: AccountingTenant,
    id: number,
    action: string,
    changes: Record<string, { from: string | number | null; to: string | number | null }>,
  ): void {
    this.db.audit({
      userId: tenant.userId,
      denominationId: tenant.denominationId,
      congregationId: tenant.congregationId,
      entity: 'BudgetLine',
      entityId: String(id),
      action,
      changes,
    });
  }
}

function groupByCommittee(rows: readonly BudgetLineRow[]): CommitteeGroup[] {
  const groups = new Map<number, BudgetLineRow[]>();
  for (const row of rows) {
    groups.set(row.fundId, [...(groups.get(row.fundId) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([fundId, lines]) => ({ fundId, fundName: lines[0].fundName, lines, totals: budgetTotals(lines) }))
    .sort((a, b) => a.fundName.localeCompare(b.fundName));
}

function cutoffLabel(year: number, today: string): string {
  const currentYear = Number(today.slice(0, 4));
  if (year < currentYear) {
    return `Ejecución real al cierre del 31/12/${year}.`;
  }
  if (year > currentYear) {
    return 'El año aún no comienza: sin ejecución registrada.';
  }
  const [, month, day] = today.split('-');
  const closedMonths = Number(month) - 1;
  return `Ejecución real al ${day}/${month}/${year}; esperada a la fecha: ${closedMonths} de 12 meses.`;
}
