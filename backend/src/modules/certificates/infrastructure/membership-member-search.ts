import { Injectable } from '@nestjs/common';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { PersonHit } from '../../membership/application/member.models.js';
import { SearchPeopleUseCase } from '../../membership/application/use-cases/search-people.use-case.js';
import type { MemberOptionView } from '../application/certificate.models.js';
import type { CertificateMemberSearch } from '../application/ports/certificate-member.search.js';

/** Members are found through SearchPeople (purpose MEMBER_LOOKUP); the document arrives masked. */
@Injectable()
export class MembershipMemberSearch implements CertificateMemberSearch {
  constructor(private readonly searchPeople: SearchPeopleUseCase) {}

  async searchActiveMembers(
    scope: TenantScope,
    query: string,
    limit: number,
  ): Promise<MemberOptionView[]> {
    const hits = await this.searchPeople.execute(scope, {
      purpose: 'MEMBER_LOOKUP',
      query,
      limit,
    });
    return hits.flatMap((hit) => {
      const option = toMemberOption(hit);
      return option ? [option] : [];
    });
  }
}

function toMemberOption(hit: PersonHit): MemberOptionView | null {
  if (hit.memberId === null) {
    return null;
  }
  return {
    id: hit.memberId,
    fullName: hit.fullName,
    code: hit.memberCode ?? '',
    documentLabel: hit.maskedDocument ?? '',
    joinedOn: hit.joinedOn,
    isBaptized: hit.isBaptized === true,
    waterBaptismOn: hit.waterBaptismOn,
  };
}
