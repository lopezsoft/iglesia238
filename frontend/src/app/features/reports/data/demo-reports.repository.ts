import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { demoCommand } from '../../../core/demo/demo-request';
import { DomainError } from '../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../accounting/data/accounting-demo-store';
import { contributionDisplayStatus } from '../../accounting/data/accounting-rules';
import { AccountingTenant, inScope, readTenant } from '../../accounting/data/accounting-tenant';
import {
  CONTRIBUTION_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../accounting/data/accounting.models';
import {
  ReportSource,
  buildFinancialReport,
  contributionFund,
  validateReportQuery,
} from './financial-report';
import {
  ContributionDetailRow,
  FinancialReport,
  ReportOptions,
  ReportQuery,
} from './reports.models';
import { coveredSedes } from './report-sedes';
import { ReportsRepository } from './reports.repository';

const ALL_FUNDS = 'Todos los fondos';
const ANONYMOUS = 'Anónimo o colecta';
const INACTIVE_SUFFIX = ' (inactiva)';

/** Demo adapter: aggregates the shared accounting tables with the tenant isolation of the API. */
@Injectable()
export class DemoReportsRepository extends ReportsRepository {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AccountingDemoStore);

  options(): Observable<ReportOptions> {
    return demoCommand(() => {
      const tenant = this.readerTenant();
      return {
        scopeLabel: this.auth.activeScope()?.label ?? '',
        denominationWide: tenant.congregationId === null,
        funds: this.store.funds
          .filter((fund) => fund.denominationId === tenant.denominationId)
          .map((fund) => ({ id: fund.id, name: fund.name, isActive: fund.isActive })),
        today: this.store.today,
      };
    });
  }

  financialReport(query: ReportQuery): Observable<FinancialReport> {
    return demoCommand(() => {
      const tenant = this.readerTenant();
      validateReportQuery(query);
      const fundLabel = this.fundLabel(tenant, query.fundId);
      return buildFinancialReport(this.source(tenant), query, {
        scopeLabel: this.auth.activeScope()?.label ?? '',
        fundLabel,
        byCongregation: tenant.congregationId === null,
      });
    });
  }

  contributionDetail(query: ReportQuery): Observable<ContributionDetailRow[]> {
    return demoCommand(() => {
      const tenant = this.readerTenant();
      if (!this.auth.can('contributions.write')) {
        throw new DomainError(
          'FORBIDDEN',
          'No tienes permiso para exportar el detalle de aportes.',
        );
      }
      validateReportQuery(query);
      this.fundLabel(tenant, query.fundId);
      const source = this.source(tenant);
      const fundOfLine = new Map(source.transactions.map((tx) => [tx.id, tx.fundId]));
      const accounts = new Map(source.accounts.map((account) => [account.id, account]));
      return source.contributions
        .filter((c) => c.receivedOn >= query.from && c.receivedOn <= query.to)
        .map((c) => ({
          contribution: c,
          fundId: contributionFund(c, source, fundOfLine, accounts),
        }))
        .filter(({ fundId }) => query.fundId === null || fundId === query.fundId)
        .sort(
          (a, b) =>
            a.contribution.receivedOn.localeCompare(b.contribution.receivedOn) ||
            a.contribution.id - b.contribution.id,
        )
        .map(({ contribution, fundId }) => ({
          receivedOn: contribution.receivedOn,
          receipt: this.store.voucherCode(contribution.voucherId),
          congregationName: this.store.congregationName(contribution.congregationId),
          contributionType:
            this.store.contributionType(tenant.denominationId, contribution.contributionTypeId)
              ?.name ?? '—',
          contributor: this.store.personName(contribution.personId) ?? ANONYMOUS,
          paymentMethod: PAYMENT_METHOD_LABELS[contribution.paymentMethod],
          paymentReference: contribution.paymentReference ?? '',
          fundName:
            fundId === null ? '—' : (this.store.fund(tenant.denominationId, fundId)?.name ?? '—'),
          amount: contribution.amount,
          status: CONTRIBUTION_STATUS_LABELS[contributionDisplayStatus(contribution)],
        }));
    });
  }

  private readerTenant(): AccountingTenant {
    const tenant = readTenant(this.auth);
    if (!this.auth.can('reports.read')) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para consultar reportes.');
    }
    return tenant;
  }

  /** Name of the selected fund; a fund of another denomination does not exist for the tenant. */
  private fundLabel(tenant: AccountingTenant, fundId: number | null): string {
    if (fundId === null) {
      return ALL_FUNDS;
    }
    const fund = this.store.fund(tenant.denominationId, fundId);
    if (!fund) {
      throw new DomainError('FUND_NOT_FOUND', 'El fondo seleccionado no existe.');
    }
    return fund.name;
  }

  private source(tenant: AccountingTenant): ReportSource {
    const store = this.store;
    const ofDenomination = <T extends { readonly denominationId: number }>(
      rows: readonly T[],
    ): T[] => rows.filter((row) => row.denominationId === tenant.denominationId);
    const openingBalances = store.fundOpeningBalances.filter((b) => inScope(tenant, b));
    const periods = store.accountingPeriods.filter((p) => inScope(tenant, p));
    const transactions = store.cashTransactions.filter((tx) => inScope(tenant, tx));
    const contributions = store.contributions.filter((c) => inScope(tenant, c));
    // One sede set for every table: a deactivated sede still counts while it owns rows.
    const sedes =
      tenant.congregationId === null
        ? coveredSedes(
            store.congregationIdsOf(tenant.denominationId),
            openingBalances,
            periods,
            transactions,
            contributions,
          )
        : [{ id: tenant.congregationId, isActive: true }];
    return {
      accounts: ofDenomination(store.accounts),
      funds: ofDenomination(store.funds),
      contributionTypes: ofDenomination(store.contributionTypes),
      openingBalances,
      periods,
      transactions,
      contributions,
      congregations: sedes.map(({ id, isActive }) => ({
        id,
        name: `${store.congregationName(id)}${isActive ? '' : INACTIVE_SUFFIX}`,
      })),
    };
  }
}
