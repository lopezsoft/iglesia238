import { Observable } from 'rxjs';
import { PersonOption } from '../../data/accounting.models';
import { ExportedFile } from '../../data/accounting-http';
import {
  ContributionDetail,
  ContributionFilters,
  ContributionFormOptions,
  ContributionListing,
  ContributionQuery,
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
  /** One page of a month (or date range) with the filters applied by the server. */
  abstract list(query: ContributionQuery): Observable<ContributionListing>;
  abstract detail(contributionId: number): Observable<ContributionDetail>;
  /** Living members of the denomination (two characters minimum); the document comes masked. */
  abstract searchPersons(query: string): Observable<PersonOption[]>;
  /** Pledges of the person and type that are still open (not fulfilled nor cancelled). */
  abstract openPledges(personId: number, contributionTypeId: number): Observable<VowPledgeOption[]>;
  abstract vowPaymentTarget(pledgeId: number): Observable<VowPaymentTarget>;
  abstract record(command: RecordContributionCommand): Observable<ContributionRow>;
  abstract void(contributionId: number, reason: string): Observable<ContributionRow>;
  /** The receipt of a contribution ready to print (PDF), by the id of its receipt voucher. */
  abstract receiptPdf(voucherId: number): Observable<Blob>;
  /** CSV of the filter (all pages). The API audits the export. */
  abstract exportCsv(filters: ContributionFilters): Observable<ExportedFile>;
}
