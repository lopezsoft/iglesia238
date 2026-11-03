import { Inject, Injectable } from '@nestjs/common';
import { InvalidInputException } from '../../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  CHILD_DEDICATION_REPOSITORY,
  CONGREGATION_DIRECTORY,
  MARRIAGE_REPOSITORY,
  PASTORAL_TERM_REPOSITORY,
  PEOPLE_SEARCH,
  type ChildDedicationRepository,
  type CongregationDirectory,
  type MarriageRepository,
  type PastoralTermRepository,
  type PeopleSearch,
} from '../ports/records.ports.js';
import {
  MAX_RECORD_LIST_SIZE,
  type NamedOption,
  type PersonEligibility,
  type PersonOption,
} from '../records.models.js';

export interface RecordsContext {
  /** Today in Bogota (ISO date). */
  readonly today: string;
  /** Sedes the active scope can record for. */
  readonly congregations: readonly NamedOption[];
}

/** What the records screen needs before it renders: the sedes of the scope and the server date. */
@Injectable()
export class GetRecordsContext {
  constructor(
    @Inject(CONGREGATION_DIRECTORY)
    private readonly congregations: CongregationDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<RecordsContext> {
    return {
      today: this.clock.today(),
      congregations: await this.congregations.listActive(tenant.tenantScope()),
    };
  }
}

export interface RecordsSummary {
  readonly year: number;
  readonly dedicationsThisYear: number;
  readonly dedicationsTotal: number;
  readonly marriagesActive: number;
  readonly marriagesDissolved: number;
  readonly termsTotal: number;
  /** Only when the scope is a single sede. */
  readonly currentPastor: {
    readonly congregationId: number;
    readonly congregationName: string;
    readonly fullName: string;
    readonly startedOn: string;
  } | null;
  readonly congregationsWithPastor: number;
  readonly congregationsTotal: number;
}

/** The figures of the cards on top of the records screen. */
@Injectable()
export class GetRecordsSummary {
  constructor(
    @Inject(CHILD_DEDICATION_REPOSITORY)
    private readonly dedications: ChildDedicationRepository,
    @Inject(MARRIAGE_REPOSITORY) private readonly marriages: MarriageRepository,
    @Inject(PASTORAL_TERM_REPOSITORY)
    private readonly terms: PastoralTermRepository,
    @Inject(CONGREGATION_DIRECTORY)
    private readonly congregations: CongregationDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<RecordsSummary> {
    const scope = tenant.tenantScope();
    const year = Number(this.clock.today().slice(0, 4));
    const [dedications, marriages, terms, congregations] = await Promise.all([
      this.dedications.counts(scope, year),
      this.marriages.counts(scope),
      this.terms.list(scope, {}),
      this.congregations.listActive(scope),
    ]);

    const activeIds = new Set(
      congregations.map((congregation) => congregation.id),
    );
    const current = terms.filter(
      (term) => term.endedOn === null && activeIds.has(term.congregationId),
    );
    const single = scope.congregationId === null ? undefined : current[0];
    return {
      year,
      dedicationsThisYear: dedications.thisYear,
      dedicationsTotal: dedications.total,
      marriagesActive: marriages.active,
      marriagesDissolved: marriages.dissolved,
      termsTotal: terms.length,
      currentPastor: single
        ? {
            congregationId: single.congregationId,
            congregationName: single.congregationName,
            fullName: single.pastor.fullName,
            startedOn: single.startedOn,
          }
        : null,
      congregationsWithPastor: new Set(
        current.map((term) => term.congregationId),
      ).size,
      congregationsTotal: congregations.length,
    };
  }
}

export interface SearchRecordPeopleQuery {
  readonly query: string;
  readonly limit?: number;
  readonly eligibleFor?: PersonEligibility;
}

/**
 * People the record forms can pick. It is a thin consumer of the shared people search: the document
 * comes back masked and there is no way to list the whole denomination (a search text is required).
 */
@Injectable()
export class SearchRecordPeople {
  constructor(@Inject(PEOPLE_SEARCH) private readonly search: PeopleSearch) {}

  async execute(
    tenant: TenantContext,
    query: SearchRecordPeopleQuery,
  ): Promise<PersonOption[]> {
    const text = query.query.trim();
    if (text === '') {
      throw new InvalidInputException(
        'Escribe el nombre o el documento de la persona.',
      );
    }
    return this.search.search(tenant.tenantScope(), {
      query: text,
      limit: Math.min(query.limit ?? 8, MAX_RECORD_LIST_SIZE),
      eligibleFor: query.eligibleFor,
    });
  }
}
