import { Injectable, PipeTransform } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { CommandContext } from '../application/command-context.js';
import type { PersonData, PersonHit } from '../application/member.models.js';
import type { MemberFiltersInput } from '../application/use-cases/list-members.use-case.js';
import type { MemberFiltersQueryDto } from './dto/member-requests.dto.js';
import type { PersonDataDto } from './dto/member-requests.dto.js';

/** A path id that is not a positive integer cannot name any resource: it is a 404. */
@Injectable()
export class IdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new NotFoundDomainException('El registro no existe.');
    }
    return id;
  }
}

export function toCommandContext(
  tenant: TenantContext,
  ipAddress: string | null,
): CommandContext {
  return { scope: tenant.tenantScope(), actor: tenant, ipAddress };
}

export function toPersonData(dto: PersonDataDto): PersonData {
  return {
    firstName: dto.firstName,
    lastName: dto.lastName,
    secondLastName: dto.secondLastName ?? null,
    documentTypeCode: dto.documentTypeCode ?? null,
    documentNumber: dto.documentNumber ?? null,
    birthDate: dto.birthDate ?? null,
    sex: dto.sex ?? null,
    maritalStatusCode: dto.maritalStatusCode ?? null,
    educationLevelCode: dto.educationLevelCode ?? null,
    profession: dto.profession ?? null,
    occupation: dto.occupation ?? null,
    phone: dto.phone ?? null,
    email: dto.email ?? null,
    address: dto.address ?? null,
    municipalityCode: dto.municipalityCode ?? null,
    ...(dto.documentIssuePlaceCode !== undefined
      ? { documentIssuePlaceCode: dto.documentIssuePlaceCode }
      : {}),
    ...(dto.birthPlaceCode !== undefined
      ? { birthPlaceCode: dto.birthPlaceCode }
      : {}),
    ...(dto.workplace !== undefined ? { workplace: dto.workplace } : {}),
    ...(dto.childrenCount !== undefined
      ? { childrenCount: dto.childrenCount }
      : {}),
    ...(dto.landlinePhone !== undefined
      ? { landlinePhone: dto.landlinePhone }
      : {}),
    ...(dto.workPhone !== undefined ? { workPhone: dto.workPhone } : {}),
    ...(dto.neighborhood !== undefined
      ? { neighborhood: dto.neighborhood }
      : {}),
    ...(dto.spouseFullName !== undefined
      ? { spouseFullName: dto.spouseFullName }
      : {}),
    ...(dto.marriageIsCivil !== undefined
      ? { marriageIsCivil: dto.marriageIsCivil }
      : {}),
    ...(dto.marriageIsChristian !== undefined
      ? { marriageIsChristian: dto.marriageIsChristian }
      : {}),
    ...(dto.marriageIsCatholic !== undefined
      ? { marriageIsCatholic: dto.marriageIsCatholic }
      : {}),
    ...(dto.tribunalOpinion !== undefined
      ? { tribunalOpinion: dto.tribunalOpinion }
      : {}),
  };
}

export function toFilters(query: MemberFiltersQueryDto): MemberFiltersInput {
  return {
    text: query.text ?? '',
    status: query.status,
    sex: query.sex,
    ageRange: query.ageRange,
    position:
      query.position === 'ALL' || query.position === 'NONE'
        ? query.position
        : Number(query.position),
    congregationId: query.congregationId ?? null,
  };
}

// ---------- Projections of a PersonHit, one per consumer ----------

export function toPersonOption(hit: PersonHit) {
  return {
    id: hit.personId,
    fullName: hit.fullName,
    documentTypeCode: hit.documentTypeCode,
    maskedDocument: hit.maskedDocument,
    memberCode: hit.memberCode,
    congregationName: hit.congregationName,
  };
}
