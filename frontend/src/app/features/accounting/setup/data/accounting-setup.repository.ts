import { Observable } from 'rxjs';
import {
  AccountRow,
  ContributionTypeRow,
  FundRow,
  SaveAccountCommand,
  SaveContributionTypeCommand,
  SaveFundCommand,
  SetupOverview,
} from './accounting-setup.models';

/**
 * Port of the accounting setup (E-01): funds, chart of accounts and contribution types of the
 * denomination, plus the opening balances of the active sede. Writes need budgets.manage.
 */
export abstract class AccountingSetupRepository {
  abstract overview(): Observable<SetupOverview>;

  abstract listFunds(): Observable<FundRow[]>;
  abstract saveFund(command: SaveFundCommand): Observable<FundRow>;
  abstract deleteFund(id: number): Observable<void>;

  /** Accounts in tree order (parent first, children by code). */
  abstract listAccounts(): Observable<AccountRow[]>;
  abstract saveAccount(command: SaveAccountCommand): Observable<AccountRow>;
  abstract deleteAccount(id: number): Observable<void>;

  abstract listContributionTypes(): Observable<ContributionTypeRow[]>;
  abstract saveContributionType(command: SaveContributionTypeCommand): Observable<ContributionTypeRow>;
  abstract setContributionTypeActive(id: number, isActive: boolean): Observable<ContributionTypeRow>;
}
