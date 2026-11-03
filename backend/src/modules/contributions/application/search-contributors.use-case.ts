import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  maskDocument,
  memberCodeOf,
  shortPersonName,
} from '../domain/contribution-rules.js';
import type { PersonOption } from './contribution.models.js';

export const CONTRIBUTOR_SEARCH = Symbol('CONTRIBUTOR_SEARCH');

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_RESULTS = 8;

/** A member found by the contributor lookup, with the raw data the projection masks. */
export interface ContributorCandidate {
  personId: number;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  documentTypeCode: string | null;
  documentNumber: string | null;
  memberNumber: number | null;
  congregationId: number;
  congregationCode: string | null;
  congregationName: string;
}

/**
 * Port to the people search of the membership module (SearchPeople, purpose CONTRIBUTOR): living
 * members of the denomination, those of `preferredCongregationId` first, document already masked.
 */
export interface ContributorSearch {
  search(
    scope: TenantScope,
    query: string,
    limit: number,
    preferredCongregationId: number | null,
  ): Promise<PersonOption[]>;
}

/**
 * Picker of the contributor for Aportes y Votos. It has its own permission rule: the treasurer
 * holds contributions.read but not members.read, so it is a separate thin entry point over the
 * shared people search. The document is masked there, on the server, once.
 */
@Injectable()
export class SearchContributorsUseCase {
  constructor(
    @Inject(CONTRIBUTOR_SEARCH) private readonly people: ContributorSearch,
  ) {}

  async execute(tenant: TenantContext, query: string): Promise<PersonOption[]> {
    const text = query.trim();
    if (text.length < MIN_SEARCH_LENGTH) {
      return [];
    }
    const scope = tenant.tenantScope();
    return this.people.search(
      scope,
      text,
      MAX_SEARCH_RESULTS,
      scope.congregationId,
    );
  }
}

/** The projection of a member the pickers show: the document and the code are masked here. */
export function toPersonOption(candidate: ContributorCandidate): PersonOption {
  return {
    id: candidate.personId,
    fullName: shortPersonName(candidate) ?? '—',
    memberCode:
      memberCodeOf(
        candidate.memberNumber !== null && candidate.congregationCode
          ? {
              memberNumber: candidate.memberNumber,
              congregationCode: candidate.congregationCode,
            }
          : null,
      ) ?? '—',
    congregationName: candidate.congregationName,
    documentHint: maskDocument(
      candidate.documentTypeCode,
      candidate.documentNumber,
    ),
  };
}
