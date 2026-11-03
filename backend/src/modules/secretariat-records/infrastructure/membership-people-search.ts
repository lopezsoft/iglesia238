import { Injectable } from '@nestjs/common';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { PersonHit } from '../../membership/application/member.models.js';
import { SearchPeopleUseCase } from '../../membership/application/use-cases/search-people.use-case.js';
import type { PeopleSearch } from '../application/ports/records.ports.js';
import type {
  PersonEligibility,
  PersonOption,
} from '../application/records.models.js';

/**
 * The records forms look for people through the shared SearchPeople use case of the membership
 * module, with the SECRETARIAT purpose; the document always arrives masked from there.
 */
@Injectable()
export class MembershipPeopleSearch implements PeopleSearch {
  constructor(private readonly searchPeople: SearchPeopleUseCase) {}

  async search(
    scope: TenantScope,
    params: { query: string; limit?: number; eligibleFor?: PersonEligibility },
  ): Promise<PersonOption[]> {
    const hits = await this.searchPeople.execute(scope, {
      purpose: 'SECRETARIAT',
      query: params.query,
      limit: params.limit,
      eligibleFor: params.eligibleFor,
    });
    return hits.map(toPersonOption);
  }
}

function toPersonOption(hit: PersonHit): PersonOption {
  return {
    id: hit.personId,
    fullName: hit.fullName,
    memberCode: hit.memberCode,
    congregationId: hit.congregationId,
    sex: hit.sex,
    birthDate: hit.birthDate,
    age: hit.age,
    maskedDocument: hit.maskedDocument,
    hasActiveMarriage: hit.hasActiveMarriage,
  };
}
