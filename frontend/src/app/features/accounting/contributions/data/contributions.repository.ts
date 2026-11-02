import { Observable } from 'rxjs';
import { PersonOption } from '../../data/accounting.models';
import { YearMonth } from '../../data/accounting-rules';
import {
  ContributionFormOptions,
  ContributionMonth,
  ContributionRow,
  RecordContributionCommand,
  VowPaymentTarget,
  VowPledgeOption,
} from './contributions.models';

/**
 * Port of Aportes (E-02). Reading needs contributions.read; recording and voiding need
 * contributions.write and a sede scope. Contributions are never deleted: they are voided.
 */
export abstract class ContributionsRepository {
  abstract formOptions(): Observable<ContributionFormOptions>;
  abstract listMonth(period: YearMonth): Observable<ContributionMonth>;
  /** Living members of the denomination (two characters minimum). */
  abstract searchPersons(query: string): Observable<PersonOption[]>;
  /** Pledges of the person and type that are still open (not fulfilled nor cancelled). */
  abstract openPledges(personId: number, contributionTypeId: number): Observable<VowPledgeOption[]>;
  abstract vowPaymentTarget(pledgeId: number): Observable<VowPaymentTarget>;
  abstract record(command: RecordContributionCommand): Observable<ContributionRow>;
  abstract void(contributionId: number, reason: string): Observable<ContributionRow>;
}
