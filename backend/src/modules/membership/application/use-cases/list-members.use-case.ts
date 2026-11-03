import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { CommandContext } from '../command-context.js';
import {
  AGE_RANGE_BOUNDS,
  ageOn,
  birthBoundsForAges,
} from '../member-rules.js';
import {
  AgeRange,
  MemberListCriteria,
  MemberListRow,
  MemberSortField,
  MemberStatus,
  PositionFilter,
  Sex,
  StatusCounts,
} from '../member.models.js';
import { buildMembersCsv, membersCsvFileName } from '../members-csv.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';

export const EXPORT_ROW_LIMIT = 20_000;

export interface MemberFiltersInput {
  readonly text: string;
  readonly status: 'ALL' | MemberStatus;
  readonly sex: 'ALL' | Sex;
  readonly ageRange: AgeRange;
  readonly position: PositionFilter;
  /** Narrows a denomination-wide scope to one congregation. */
  readonly congregationId: number | null;
}

export interface ListMembersQuery extends MemberFiltersInput {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy: MemberSortField;
  readonly order: 'asc' | 'desc';
}

export interface MemberListItem extends Omit<MemberListRow, 'birthDate'> {
  readonly age: number | null;
}

export interface MemberListPage {
  readonly items: readonly MemberListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly statusCounts: StatusCounts;
}

/** Applies the congregation limit of the scope and translates the age range into birth dates. */
export function toCriteria(
  scope: TenantScope,
  filters: MemberFiltersInput,
  today: string,
): MemberListCriteria {
  if (
    scope.congregationId !== null &&
    filters.congregationId !== null &&
    filters.congregationId !== scope.congregationId
  ) {
    throw new NotFoundDomainException();
  }
  const bounds = birthBoundsForAges(AGE_RANGE_BOUNDS[filters.ageRange], today);
  return {
    text: filters.text.trim(),
    status: filters.status,
    sex: filters.sex,
    bornOnOrAfter: bounds.bornOnOrAfter,
    bornOnOrBefore: bounds.bornOnOrBefore,
    position: filters.position,
    congregationId: scope.congregationId ?? filters.congregationId,
  };
}

@Injectable()
export class ListMembersUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    scope: TenantScope,
    query: ListMembersQuery,
  ): Promise<MemberListPage> {
    const today = this.clock.today();
    const result = await this.members.list(
      scope,
      toCriteria(scope, query, today),
      {
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        order: query.order,
      },
    );
    return {
      items: result.rows.map(({ birthDate, ...row }) => ({
        ...row,
        age: ageOn(birthDate, today),
      })),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      statusCounts: result.statusCounts,
    };
  }
}

export interface MembersExport {
  readonly fileName: string;
  readonly content: string;
  readonly rows: number;
}

/** CSV export of the filtered list. The audit trail records how many rows left, never who they were. */
@Injectable()
export class ExportMembersUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    filters: MemberFiltersInput,
  ): Promise<MembersExport> {
    const today = this.clock.today();
    const rows = await this.members.listForExport(
      context.scope,
      toCriteria(context.scope, filters, today),
      EXPORT_ROW_LIMIT,
    );
    const includeCongregation = context.scope.congregationId === null;
    await this.audit.record({
      action: 'MEMBERS_EXPORTED',
      entity: 'Member',
      entityId: '*',
      actor: context.actor,
      changes: { rows: { from: null, to: rows.length } },
      ipAddress: context.ipAddress,
    });
    return {
      fileName: membersCsvFileName(today),
      content: buildMembersCsv(rows, includeCongregation, (birth) =>
        ageOn(birth, today),
      ),
      rows: rows.length,
    };
  }
}
