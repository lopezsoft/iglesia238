import { Observable } from 'rxjs';
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

/**
 * Port of the accounting setup (E-01): funds, chart of accounts and contribution types of the
 * denomination, the opening balances, accounting periods and tithe percentages of the active
 * sede. Writes need budgets.manage (opening a period also accepts cash-transactions.write).
 */
export abstract class AccountingSetupRepository {
  abstract overview(): Observable<SetupOverview>;

  abstract listFunds(): Observable<FundRow[]>;
  abstract saveFund(command: SaveFundCommand): Observable<FundRow>;
  abstract deleteFund(id: number): Observable<void>;

  /** Accounts in tree order (parent first, children by code). */
  abstract listAccounts(): Observable<AccountRow[]>;
  abstract saveAccount(command: SaveAccountCommand): Observable<AccountRow>;
  abstract setAccountActive(id: number, isActive: boolean): Observable<AccountRow>;
  abstract deleteAccount(id: number): Observable<void>;

  abstract listContributionTypes(): Observable<ContributionTypeRow[]>;
  abstract saveContributionType(command: SaveContributionTypeCommand): Observable<ContributionTypeRow>;
  abstract setContributionTypeActive(id: number, isActive: boolean): Observable<ContributionTypeRow>;

  /** Periods of the active sede, newest first (empty for a denomination-wide session). */
  abstract listPeriods(): Observable<PeriodRow[]>;
  /** Opens a month: the first one of a new sede, or the one next to the existing range. */
  abstract openPeriod(command: OpenPeriodCommand): Observable<PeriodRow>;

  /** Tithe percentages, newest first. */
  abstract listTitheRules(): Observable<TitheRuleRow[]>;
  abstract saveTitheRule(command: SaveTitheRuleCommand): Observable<TitheRuleRow>;
  abstract deleteTitheRule(id: number): Observable<void>;
}
