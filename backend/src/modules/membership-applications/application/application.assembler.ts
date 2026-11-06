import { Inject, Injectable } from '@nestjs/common';
import {
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../../common/mappers/value-mappers.js';
import { formatMemberCode } from '../../../common/numbering/document-numbering.service.js';
import { ageOn, isMinorOn } from '../../../common/people/age.js';
import { composeFullName } from '../../../common/people/full-name.js';
import { normalizeDocumentNumber } from '../../../common/people/document-number.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { isReviewable } from '../domain/application-status.js';
import type {
  ApplicationDetailView,
  ApplicationSummaryView,
  PersonMatchView,
} from './application-views.js';
import type {
  ApplicationRecord,
  ApplicationSummaryRecord,
} from './ports/applications.repository.js';
import {
  MEMBERSHIP_REGISTRY,
  type DocumentRef,
  type ExistingPerson,
  type MembershipRegistry,
} from './ports/membership-registry.port.js';

export function memberCodeOf(
  member: { congregationCode: string; memberNumber: number | null } | null,
): string | null {
  return member && member.memberNumber !== null
    ? formatMemberCode(member.congregationCode, member.memberNumber)
    : null;
}

export function toPersonMatch(person: ExistingPerson): PersonMatchView {
  return {
    personId: person.id,
    fullName: person.fullName,
    documentTypeCode: person.documentTypeCode,
    documentNumber: person.documentNumber,
    congregationName: person.member?.congregationName ?? null,
    memberId: person.member?.id ?? null,
    memberCode: memberCodeOf(person.member),
    memberStatus: person.member?.status ?? null,
  };
}

export function documentRefOf(record: {
  documentTypeCode: string | null;
  documentNumber: string | null;
}): DocumentRef | null {
  if (!record.documentTypeCode || !record.documentNumber) {
    return null;
  }
  const documentNumber = normalizeDocumentNumber(record.documentNumber);
  return documentNumber === ''
    ? null
    : { documentTypeCode: record.documentTypeCode, documentNumber };
}

export function sameDocument(
  person: ExistingPerson,
  ref: DocumentRef,
): boolean {
  return (
    person.documentTypeCode === ref.documentTypeCode &&
    person.documentNumber !== null &&
    normalizeDocumentNumber(person.documentNumber) === ref.documentNumber
  );
}

/** Builds the views of the review screen: names, ages, duplicates and member codes. */
@Injectable()
export class ApplicationAssembler {
  constructor(
    @Inject(MEMBERSHIP_REGISTRY) private readonly registry: MembershipRegistry,
    private readonly clock: Clock,
  ) {}

  async summaries(
    scope: TenantScope,
    records: readonly ApplicationSummaryRecord[],
  ): Promise<ApplicationSummaryView[]> {
    const today = this.clock.today();
    const refs = records
      .filter((record) => isReviewable(record.status))
      .map(documentRefOf)
      .filter((ref): ref is DocumentRef => ref !== null);
    const people =
      refs.length > 0
        ? await this.registry.findPeopleByDocuments(scope, refs)
        : [];

    return records.map((record) => {
      const ref = documentRefOf(record);
      return {
        id: record.id,
        congregationId: record.congregationId,
        congregationName: record.congregationName,
        status: record.status,
        fullName: composeFullName(
          record.firstName,
          record.lastName,
          record.secondLastName,
        ),
        documentTypeCode: record.documentTypeCode,
        documentNumber: record.documentNumber,
        createdAt: toIsoDateTime(record.createdAt),
        isMinor:
          isMinorOn(record.birthDate, today) || record.guardianName !== null,
        hasDuplicateMatch:
          isReviewable(record.status) &&
          ref !== null &&
          people.some((person) => sameDocument(person, ref)),
      };
    });
  }

  async detail(
    scope: TenantScope,
    record: ApplicationRecord,
  ): Promise<ApplicationDetailView> {
    const today = this.clock.today();
    const { formData } = record;

    const ref = documentRefOf(record);
    const duplicate =
      isReviewable(record.status) && ref !== null
        ? (await this.registry.findPeopleByDocuments(scope, [ref])).find(
            (person) => sameDocument(person, ref),
          )
        : undefined;
    const linked =
      record.status === 'DUPLICATE' && record.matchedPersonId !== null
        ? await this.registry.findPerson(scope, record.matchedPersonId)
        : null;

    return {
      id: record.id,
      congregationId: record.congregationId,
      congregationName: record.congregationName,
      status: record.status,
      documentTypeCode: record.documentTypeCode,
      documentTypeName: record.documentTypeName,
      documentNumber: record.documentNumber,
      firstName: record.firstName,
      lastName: record.lastName,
      fullName: composeFullName(
        record.firstName,
        record.lastName,
        formData.secondLastName,
      ),
      email: record.email,
      phone: record.phone,
      birthDate: record.birthDate,
      age: record.birthDate ? ageOn(record.birthDate, today) : null,
      isMinor:
        isMinorOn(record.birthDate, today) || record.guardianName !== null,
      guardianName: record.guardianName,
      guardianDocument: record.guardianDocument,
      formData: {
        secondLastName: formData.secondLastName,
        sex: formData.sex,
        maritalStatusCode: formData.maritalStatusCode,
        maritalStatusName: record.maritalStatusName,
        address: formData.address,
        municipalityCode: formData.municipalityCode,
        municipalityName: record.municipalityName,
        regionName: record.regionName,
        neighborhood: formData.neighborhood,
        occupation: formData.occupation,
        previousCongregationName: formData.previousCongregationName,
        isBaptized: formData.isBaptized,
        guardianRelationship: formData.guardian?.relationship ?? null,
        guardianPhone: formData.guardian?.phone ?? null,
        guardianDocumentTypeCode: formData.guardian?.documentTypeCode ?? null,
        documentIssuePlaceCode: formData.documentIssuePlaceCode ?? null,
        birthPlaceCode: formData.birthPlaceCode ?? null,
        landlinePhone: formData.landlinePhone ?? null,
        educationLevelCode: formData.educationLevelCode ?? null,
        profession: formData.profession ?? null,
        workplace: formData.workplace ?? null,
        workPhone: formData.workPhone ?? null,
        marriageIsCivil: formData.marriageIsCivil ?? false,
        marriageIsChristian: formData.marriageIsChristian ?? false,
        marriageIsCatholic: formData.marriageIsCatholic ?? false,
        spouseFullName: formData.spouseFullName ?? null,
        passedEcclesiasticalTribunal:
          formData.passedEcclesiasticalTribunal ?? null,
        tribunalOpinion: formData.tribunalOpinion ?? null,
        fatherFullName: formData.fatherFullName ?? null,
        motherFullName: formData.motherFullName ?? null,
        childrenCount: formData.childrenCount ?? null,
        childrenNames: formData.childrenNames ?? null,
        convertedOn: formData.convertedOn ?? null,
        waterBaptismOn: formData.waterBaptismOn ?? null,
        baptismMunicipalityCode: formData.baptismMunicipalityCode ?? null,
        baptismPlace: formData.baptismPlace ?? null,
        baptizingPastorName: formData.baptizingPastorName ?? null,
        holySpiritBaptismOn: formData.holySpiritBaptismOn ?? null,
        reconciledOn: formData.reconciledOn ?? null,
        previousCongregationId: formData.previousCongregationId ?? null,
        pastPositionsText: formData.pastPositionsText ?? null,
        currentPositionsText: formData.currentPositionsText ?? null,
        desiredAreas: formData.desiredAreas ?? null,
        isChristianEducationTeacher:
          formData.isChristianEducationTeacher ?? false,
      },
      policyVersion: record.policyVersion,
      consentedAt: toIsoDateTime(record.consentedAt),
      createdAt: toIsoDateTime(record.createdAt),
      reviewerName: record.reviewerName,
      reviewedAt: toIsoDateTimeOrNull(record.reviewedAt),
      rejectionReason: record.rejectionReason,
      duplicateMatch: duplicate ? toPersonMatch(duplicate) : null,
      linkedPerson: linked ? toPersonMatch(linked) : null,
      memberId: record.memberId,
      memberCode: memberCodeOf({
        congregationCode: record.congregationCode,
        memberNumber: record.memberNumber,
      }),
    };
  }
}
