export const PUBLIC_DIRECTORY = Symbol('PUBLIC_DIRECTORY');

export interface OpenCongregationRecord {
  id: number;
  denominationId: number;
  denominationName: string;
  name: string;
  municipalityCode: string | null;
  municipalityName: string | null;
  regionName: string | null;
  neighborhood: string | null;
  address: string | null;
}

export interface CurrentPolicyRecord {
  id: number;
  denominationId: number;
  version: string;
  content: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
}

export interface CongregationTarget {
  id: number;
  denominationId: number;
}

/** Anonymous reads: what an applicant is allowed to see before sending the form. */
export interface PublicDirectory {
  /** Active congregations of active denominations that accept applications and have a policy in force. */
  listOpenCongregations(
    today: string,
  ): Promise<readonly OpenCongregationRecord[]>;

  /** The congregation only if it is open to applications right now. */
  findOpenCongregation(id: number): Promise<CongregationTarget | null>;

  /** Published policy with the latest effective date that has already arrived. */
  findCurrentPolicy(
    denominationId: number,
    today: string,
  ): Promise<CurrentPolicyRecord | null>;

  documentTypeExists(code: string): Promise<boolean>;
  maritalStatusExists(code: string): Promise<boolean>;
  municipalityExists(code: string): Promise<boolean>;
}
