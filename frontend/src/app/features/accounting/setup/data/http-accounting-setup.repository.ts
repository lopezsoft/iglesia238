import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  AccountRow,
  ContributionTypeRow,
  FundRow,
  OpenPeriodCommand,
  PeriodRow,
  SaveAccountCommand,
  SaveContributionTypeCommand,
  SaveFundCommand,
  SaveTitheRuleCommand,
  SetupOverview,
  TitheRuleRow,
} from './accounting-setup.models';
import { AccountingSetupRepository } from './accounting-setup.repository';

/** Adapter of the accounting setup over `/api/accounting/*`. */
@Injectable()
export class HttpAccountingSetupRepository extends AccountingSetupRepository {
  private readonly http = inject(HttpClient);

  override overview(): Observable<SetupOverview> {
    return this.http.get<SetupOverview>(apiUrl('/accounting/setup/overview'));
  }

  // --- Funds ---------------------------------------------------------------------------------------

  override listFunds(): Observable<FundRow[]> {
    return this.http.get<FundRow[]>(apiUrl('/accounting/funds'));
  }

  override saveFund(command: SaveFundCommand): Observable<FundRow> {
    const { id, ...body } = command;
    return id === null
      ? this.http.post<FundRow>(apiUrl('/accounting/funds'), body)
      : this.http.put<FundRow>(apiUrl(`/accounting/funds/${id}`), body);
  }

  override deleteFund(id: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`/accounting/funds/${id}`));
  }

  // --- Chart of accounts ---------------------------------------------------------------------------

  override listAccounts(): Observable<AccountRow[]> {
    return this.http.get<AccountRow[]>(apiUrl('/accounting/accounts'));
  }

  override saveAccount(command: SaveAccountCommand): Observable<AccountRow> {
    if (command.id === null) {
      const { id: _id, ...body } = command;
      return this.http.post<AccountRow>(apiUrl('/accounting/accounts'), body);
    }
    // The parent and the nature are fixed once the account exists.
    const { code, name, isPostable, defaultFundId } = command;
    return this.http.put<AccountRow>(apiUrl(`/accounting/accounts/${command.id}`), {
      code,
      name,
      isPostable,
      defaultFundId,
    });
  }

  override setAccountActive(id: number, isActive: boolean): Observable<AccountRow> {
    return this.http.patch<AccountRow>(apiUrl(`/accounting/accounts/${id}/active`), { isActive });
  }

  override deleteAccount(id: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`/accounting/accounts/${id}`));
  }

  // --- Contribution types --------------------------------------------------------------------------

  override listContributionTypes(): Observable<ContributionTypeRow[]> {
    return this.http.get<ContributionTypeRow[]>(apiUrl('/accounting/contribution-types'));
  }

  override saveContributionType(command: SaveContributionTypeCommand): Observable<ContributionTypeRow> {
    const { id, ...body } = command;
    return id === null
      ? this.http.post<ContributionTypeRow>(apiUrl('/accounting/contribution-types'), body)
      : this.http.put<ContributionTypeRow>(apiUrl(`/accounting/contribution-types/${id}`), body);
  }

  override setContributionTypeActive(id: number, isActive: boolean): Observable<ContributionTypeRow> {
    return this.http.patch<ContributionTypeRow>(apiUrl(`/accounting/contribution-types/${id}/active`), { isActive });
  }

  // --- Periods -------------------------------------------------------------------------------------

  override listPeriods(): Observable<PeriodRow[]> {
    return this.http.get<PeriodRow[]>(apiUrl('/accounting/periods'));
  }

  override openPeriod(command: OpenPeriodCommand): Observable<PeriodRow> {
    return this.http.post<PeriodRow>(apiUrl('/accounting/periods'), command);
  }

  // --- Tithe percentages ---------------------------------------------------------------------------

  override listTitheRules(): Observable<TitheRuleRow[]> {
    return this.http.get<TitheRuleRow[]>(apiUrl('/accounting/tithe-rules'));
  }

  override saveTitheRule(command: SaveTitheRuleCommand): Observable<TitheRuleRow> {
    const { id, ...body } = command;
    return id === null
      ? this.http.post<TitheRuleRow>(apiUrl('/accounting/tithe-rules'), body)
      : this.http.put<TitheRuleRow>(apiUrl(`/accounting/tithe-rules/${id}`), body);
  }

  override deleteTitheRule(id: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`/accounting/tithe-rules/${id}`));
  }
}
