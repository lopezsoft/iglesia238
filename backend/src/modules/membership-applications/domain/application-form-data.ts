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
  /** Optional normalized & extended fields from the IPUC membership form (F-701). */
  documentIssuePlaceCode?: string | null;
  birthPlaceCode?: string | null;
  landlinePhone?: string | null;
  educationLevelCode?: string | null;
  profession?: string | null;
  workplace?: string | null;
  workPhone?: string | null;
  marriageIsCivil?: boolean;
  marriageIsChristian?: boolean;
  marriageIsCatholic?: boolean;
  spouseFullName?: string | null;
  passedEcclesiasticalTribunal?: boolean | null;
  tribunalOpinion?: string | null;
  fatherFullName?: string | null;
  motherFullName?: string | null;
  childrenCount?: number | null;
  childrenNames?: string | null;
  convertedOn?: string | null;
  waterBaptismOn?: string | null;
  baptismMunicipalityCode?: string | null;
  baptismPlace?: string | null;
  baptizingPastorName?: string | null;
  holySpiritBaptismOn?: string | null;
  reconciledOn?: string | null;
  previousCongregationId?: number | null;
  pastPositionsText?: string | null;
  currentPositionsText?: string | null;
  desiredAreas?: string | null;
  isChristianEducationTeacher?: boolean;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
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
    isBaptized: nullableBoolean(raw.isBaptized),
    guardian: readGuardian(raw.guardian),
    documentIssuePlaceCode: text(raw.documentIssuePlaceCode),
    birthPlaceCode: text(raw.birthPlaceCode),
    landlinePhone: text(raw.landlinePhone),
    educationLevelCode: text(raw.educationLevelCode),
    profession: text(raw.profession),
    workplace: text(raw.workplace),
    workPhone: text(raw.workPhone),
    marriageIsCivil: raw.marriageIsCivil === true,
    marriageIsChristian: raw.marriageIsChristian === true,
    marriageIsCatholic: raw.marriageIsCatholic === true,
    spouseFullName: text(raw.spouseFullName),
    passedEcclesiasticalTribunal: nullableBoolean(
      raw.passedEcclesiasticalTribunal,
    ),
    tribunalOpinion: text(raw.tribunalOpinion),
    fatherFullName: text(raw.fatherFullName),
    motherFullName: text(raw.motherFullName),
    childrenCount: nonNegativeInt(raw.childrenCount),
    childrenNames: text(raw.childrenNames),
    convertedOn: text(raw.convertedOn),
    waterBaptismOn: text(raw.waterBaptismOn),
    baptismMunicipalityCode: text(raw.baptismMunicipalityCode),
    baptismPlace: text(raw.baptismPlace),
    baptizingPastorName: text(raw.baptizingPastorName),
    holySpiritBaptismOn: text(raw.holySpiritBaptismOn),
    reconciledOn: text(raw.reconciledOn),
    previousCongregationId: positiveInt(raw.previousCongregationId),
    pastPositionsText: text(raw.pastPositionsText),
    currentPositionsText: text(raw.currentPositionsText),
    desiredAreas: text(raw.desiredAreas),
    isChristianEducationTeacher: raw.isChristianElemTeacher === true || raw.isChristianEducationTeacher === true,
  };
}
