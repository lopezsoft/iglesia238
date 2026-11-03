import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  InvalidInputException,
} from '../../../../common/errors/domain.exception.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { requireMember } from '../command-context.js';
import {
  ADULT_AGE,
  ageOn,
  birthBoundsForAges,
  minusYears,
} from '../member-rules.js';
import type {
  PersonEligibility,
  PersonHit,
  PersonSearchCriteria,
  PersonSearchPurpose,
  PersonSearchRow,
} from '../member.models.js';
import { PEOPLE_SEARCH_REPOSITORY } from '../ports/member-details.repositories.js';
import type { PeopleSearchRepository } from '../ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';
import { maskDocument } from '../person-text.js';

export const MIN_QUERY_LENGTH = 2;
export const DEFAULT_SEARCH_LIMIT = 8;
export const MAX_SEARCH_LIMIT = 50;
/** Rows fetched per result wanted when a filter is applied after the query (spouses). */
const OVERFETCH_FACTOR = 3;

export interface SearchPeopleQuery {
  readonly purpose: PersonSearchPurpose;
  readonly query: string;
  readonly limit?: number;
  readonly excludePersonId?: number;
  readonly eligibleFor?: PersonEligibility;
  readonly preferredCongregationId?: number;
}

/**
 * The single way to look for people. Consumers (certificates, secretariat records, contributions,
 * family) call it through thin controllers that choose the purpose and project the hit; the
 * document is masked here, once, so no consumer can leak it.
 */
@Injectable()
export class SearchPeopleUseCase {
  constructor(
    @Inject(PEOPLE_SEARCH_REPOSITORY)
    private readonly people: PeopleSearchRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    scope: TenantScope,
    params: SearchPeopleQuery,
  ): Promise<PersonHit[]> {
    const query = params.query.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      return [];
    }
    if (params.purpose === 'MEMBER_LOOKUP' && scope.congregationId === null) {
      throw new InvalidInputException(
        'Indica la sede.',
        ErrorCode.CONGREGATION_SCOPE_REQUIRED,
      );
    }
    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_SEARCH_LIMIT, 1),
      MAX_SEARCH_LIMIT,
    );
    const today = this.clock.today();
    const excludeMarried = params.eligibleFor === 'spouse';
    const criteria: PersonSearchCriteria = {
      purpose: params.purpose,
      query,
      limit: excludeMarried ? limit * OVERFETCH_FACTOR : limit,
      excludePersonId: params.excludePersonId ?? null,
      preferredCongregationId: params.preferredCongregationId ?? null,
      ...this.birthWindow(params.eligibleFor, today),
      withMarriage: params.eligibleFor === 'spouse',
    };

    const rows = await this.people.search(scope, criteria);
    return rows
      .filter((row) => !excludeMarried || !row.hasActiveMarriage)
      .slice(0, limit)
      .map((row) => this.toHit(row, today));
  }

  /** Children are under 18; spouses, parents, pastors and officiants are adults (or of unknown age). */
  private birthWindow(
    eligibleFor: PersonEligibility | undefined,
    today: string,
  ): Pick<
    PersonSearchCriteria,
    'bornOnOrAfter' | 'bornOnOrBefore' | 'includeUnknownBirthDate'
  > {
    if (eligibleFor === undefined) {
      return {
        bornOnOrAfter: null,
        bornOnOrBefore: null,
        includeUnknownBirthDate: true,
      };
    }
    if (eligibleFor === 'child') {
      const bounds = birthBoundsForAges({ min: 0, max: ADULT_AGE - 1 }, today);
      return { ...bounds, includeUnknownBirthDate: false };
    }
    return {
      bornOnOrAfter: null,
      bornOnOrBefore: minusYears(today, ADULT_AGE),
      includeUnknownBirthDate: true,
    };
  }

  private toHit(row: PersonSearchRow, today: string): PersonHit {
    const { documentNumber, ...rest } = row;
    return {
      ...rest,
      maskedDocument: maskDocument(row.documentTypeCode, documentNumber),
      age: ageOn(row.birthDate, today),
    };
  }
}

/** Persons of the denomination who can be linked as relatives of a member (the member itself is left out). */
@Injectable()
export class SearchFamilyCandidatesUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    private readonly search: SearchPeopleUseCase,
  ) {}

  async execute(
    scope: TenantScope,
    memberId: number,
    query: string,
    limit?: number,
  ): Promise<PersonHit[]> {
    const member = await requireMember(this.members, scope, memberId);
    return this.search.execute(scope, {
      purpose: 'FAMILY_CANDIDATE',
      query,
      limit,
      excludePersonId: member.personId,
    });
  }
}
