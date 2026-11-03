import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { memberNotActive, memberNotFound } from '../certificate-errors.js';
import { toMemberOption } from '../certificate-mappers.js';
import type { MemberOptionView } from '../certificate.models.js';
import {
  CERTIFICATE_MEMBER_READER,
  type CertificateMemberReader,
} from '../ports/certificate-member.reader.js';
import {
  CERTIFICATE_MEMBER_SEARCH,
  type CertificateMemberSearch,
} from '../ports/certificate-member.search.js';

export const MEMBER_SEARCH_LIMIT = 8;
export const MEMBER_SEARCH_MIN_LENGTH = 2;

/** Active members of the active sede, by name, member code or document. The document is always masked. */
@Injectable()
export class SearchCertificateMembersUseCase {
  constructor(
    @Inject(CERTIFICATE_MEMBER_SEARCH)
    private readonly members: CertificateMemberSearch,
  ) {}

  async execute(
    tenant: TenantContext,
    query: string,
    limit: number = MEMBER_SEARCH_LIMIT,
  ): Promise<MemberOptionView[]> {
    const scope = tenant.congregationScope();
    const text = query.trim();
    if (text.length < MEMBER_SEARCH_MIN_LENGTH) {
      return [];
    }
    return this.members.searchActiveMembers(
      scope,
      text,
      Math.min(limit, MEMBER_SEARCH_LIMIT * 2),
    );
  }
}

/** One active member of the active sede, e.g. preselected from /certificates?memberId=. */
@Injectable()
export class FindCertificateMemberUseCase {
  constructor(
    @Inject(CERTIFICATE_MEMBER_READER)
    private readonly members: CertificateMemberReader,
  ) {}

  async execute(
    tenant: TenantContext,
    memberId: number,
  ): Promise<MemberOptionView> {
    const member = await this.members.findMember(
      tenant.congregationScope(),
      memberId,
    );
    if (!member) {
      throw memberNotFound();
    }
    if (member.status !== 'ACTIVE') {
      throw memberNotActive();
    }
    return toMemberOption(member);
  }
}
