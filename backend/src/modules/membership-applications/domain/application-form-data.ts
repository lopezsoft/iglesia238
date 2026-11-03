export type ApplicantSex = 'FEMALE' | 'MALE';

/** Adult who answers for a minor applicant and authorizes the processing of their data. */
export interface ApplicationGuardian {
  firstName: string;
  lastName: string;
  documentTypeCode: string;
  /** Normalized with normalizeDocumentNumber. */
  documentNumber: string;
  /** Spanish label chosen in the form: "Madre", "Tutor(a) legal"... */
  relationship: string;
  phone: string;
}

/**
 * Answers of the public form that have no column of their own. It is stored in
 * `membership_applications.form_data` and read back by the review.
 */
export interface ApplicationFormData {
  secondLastName: string | null;
  sex: ApplicantSex;
  maritalStatusCode: string;
  address: string;
  municipalityCode: string;
  neighborhood: string | null;
  occupation: string | null;
  previousCongregationName: string | null;
  /** null: the applicant did not say. */
  isBaptized: boolean | null;
  guardian: ApplicationGuardian | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readGuardian(value: unknown): ApplicationGuardian | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const firstName = text(raw.firstName);
  const lastName = text(raw.lastName);
  const documentTypeCode = text(raw.documentTypeCode);
  const documentNumber = text(raw.documentNumber);
  if (!firstName || !lastName || !documentTypeCode || !documentNumber) {
    return null;
  }
  return {
    firstName,
    lastName,
    documentTypeCode,
    documentNumber,
    relationship: text(raw.relationship) ?? 'Otro',
    phone: text(raw.phone) ?? '',
  };
}

/** Reads the JSON column defensively: an old or hand-edited row never breaks the review screen. */
export function parseFormData(json: unknown): ApplicationFormData {
  const raw =
    typeof json === 'object' && json !== null
      ? (json as Record<string, unknown>)
      : {};
  return {
    secondLastName: text(raw.secondLastName),
    sex: raw.sex === 'MALE' ? 'MALE' : 'FEMALE',
    maritalStatusCode: text(raw.maritalStatusCode) ?? '',
    address: text(raw.address) ?? '',
    municipalityCode: text(raw.municipalityCode) ?? '',
    neighborhood: text(raw.neighborhood),
    occupation: text(raw.occupation),
    previousCongregationName: text(raw.previousCongregationName),
    isBaptized: typeof raw.isBaptized === 'boolean' ? raw.isBaptized : null,
    guardian: readGuardian(raw.guardian),
  };
}
