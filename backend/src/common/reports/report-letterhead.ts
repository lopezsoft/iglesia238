import type { TenantScope } from '../tenancy/tenant-scope.js';
import type { ReportLetterhead } from './report-pdf.js';

export const REPORT_LETTERHEAD_READER = Symbol('REPORT_LETTERHEAD_READER');

/** Reads who issues a report: the legal entity and the sede of the scope, or the denomination alone for a wide scope. */
export interface ReportLetterheadReader {
  /** Null when the sede (or the denomination) does not exist for the scope. */
  find(scope: TenantScope): Promise<ReportLetterhead | null>;
}
