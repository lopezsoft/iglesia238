import type { TenantScope } from '../tenancy/tenant-scope.js';
import type { ReportLetterhead } from './report-pdf.js';

export const REPORT_LETTERHEAD_READER = Symbol('REPORT_LETTERHEAD_READER');

/** Reads who issues a report: the legal entity and the sede of the scope. */
export interface ReportLetterheadReader {
  /** Null when the sede does not exist in the denomination of the scope. */
  find(scope: TenantScope): Promise<ReportLetterhead | null>;
}
