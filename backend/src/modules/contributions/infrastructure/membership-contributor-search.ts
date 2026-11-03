import { Injectable } from '@nestjs/common';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { PersonHit } from '../../membership/application/member.models.js';
import { SearchPeopleUseCase } from '../../membership/application/use-cases/search-people.use-case.js';
import type { PersonOption } from '../application/contribution.models.js';
import type { ContributorSearch } from '../application/search-contributors.use-case.js';

/**
 * Contributors are found through the shared SearchPeople use case of the membership module with
 * the CONTRIBUTOR purpose; the document always arrives masked from there.
 */
@Injectable()
export class MembershipContributorSearch implements ContributorSearch {
  constructor(private readonly searchPeople: SearchPeopleUseCase) {}

  async search(
    scope: TenantScope,
    query: string,
    limit: number,
    preferredCongregationId: number | null,
  ): Promise<PersonOption[]> {
    const hits = await this.searchPeople.execute(scope, {
      purpose: 'CONTRIBUTOR',
      query,
      limit,
      ...(preferredCongregationId === null ? {} : { preferredCongregationId }),
    });
    return hits.map(toPersonOption);
  }
}

function toPersonOption(hit: PersonHit): PersonOption {
  return {
    id: hit.personId,
    fullName: hit.fullName,
    memberCode: hit.memberCode ?? '—',
    congregationName: hit.congregationName ?? '—',
    documentHint: hit.maskedDocument ?? '—',
  };
}
