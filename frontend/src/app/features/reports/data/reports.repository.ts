import { Observable } from 'rxjs';
import {
  ContributionDetailRow,
  FinancialReport,
  ReportOptions,
  ReportQuery,
} from './reports.models';

/**
 * Port to the reports API (reports.read). Figures cover the active sede or, for a
 * denomination-wide scope, every sede of the denomination.
 */
export abstract class ReportsRepository {
  abstract options(): Observable<ReportOptions>;

  /** Fails with INVALID_RANGE or RANGE_CROSSES_YEAR for a wrong range, FUND_NOT_FOUND for a foreign fund. */
  abstract financialReport(query: ReportQuery): Observable<FinancialReport>;

  /** Contribution by contribution, for the treasury export. Requires contributions.write. */
  abstract contributionDetail(query: ReportQuery): Observable<ContributionDetailRow[]>;
}
