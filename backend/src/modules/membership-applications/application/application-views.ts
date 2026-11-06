import type {
  ApplicationCounts,
  ApplicationStatus,
} from '../domain/application-status.js';
import type { MemberStatusValue } from './ports/membership-registry.port.js';

/** Existing person of the denomination that holds the same document as an application. */
export interface PersonMatchView {
  personId: number;
  fullName: string;
  documentTypeCode: string | null;
  documentNumber: string | null;
  /** Current sede of the person when they are a member. */
  congregationName: string | null;
  memberId: number | null;
  memberCode: string | null;
  memberStatus: MemberStatusValue | null;
}

export interface ApplicationSummaryView {
  id: number;
  congregationId: number;
  congregationName: string;
  status: ApplicationStatus;
  fullName: string;
  documentTypeCode: string | null;
  documentNumber: string | null;
  createdAt: string;
  isMinor: boolean;
  /** A person with the same document already exists in the denomination (reviewable only). */
  hasDuplicateMatch: boolean;
}

export interface ApplicationQueueView {
  items: readonly ApplicationSummaryView[];
  total: number;
  page: number;
  pageSize: number;
  counts: ApplicationCounts;
}

export interface ApplicationFormDataView {
  secondLastName: string | null;
  sex: 'FEMALE' | 'MALE';
  maritalStatusCode: string;
  maritalStatusName: string | null;
  address: string;
  municipalityCode: string;
  municipalityName: string | null;
  regionName: string | null;
  neighborhood: string | null;
  occupation: string | null;
  previousCongregationName: string | null;
  isBaptized: boolean | null;
  guardianRelationship: string | null;
  guardianPhone: string | null;
  guardianDocumentTypeCode: string | null;
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

export interface ApplicationDetailView {
  id: number;
  congregationId: number;
  congregationName: string;
  status: ApplicationStatus;
  documentTypeCode: string | null;
  documentTypeName: string | null;
  documentNumber: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  age: number | null;
  isMinor: boolean;
  guardianName: string | null;
  guardianDocument: string | null;
  formData: ApplicationFormDataView;
  policyVersion: string | null;
  consentedAt: string;
  createdAt: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  /** Possible duplicate, computed only while the application can still be resolved. */
  duplicateMatch: PersonMatchView | null;
  /** Person the application was linked to when it was marked as duplicate. */
  linkedPerson: PersonMatchView | null;
  memberId: number | null;
  memberCode: string | null;
}

export interface ApprovalResultView {
  applicationId: number;
  memberId: number;
  memberNumber: number;
  /** Card code of the new member in its sede, e.g. SC-0153. */
  memberCode: string;
}
