import { Inject, Injectable } from '@nestjs/common';
import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import {
  isIsoDate,
  toIsoDateTime,
} from '../../../common/mappers/value-mappers.js';
import { Page, buildPage } from '../../../common/pagination/page.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  AUDIT_LOG_READER,
  type AuditLogReader,
  type AuditRow,
  type AuditScope,
  type AuditUserRef,
} from './audit-logs.ports.js';
import {
  CONTRIBUTION_VOID_ACTION,
  PERIOD_CLOSE_ACTION,
  ROLE_CHANGE_ACTIONS,
  formatChanges,
  maskIpAddress,
  type AuditFieldChangeView,
} from './audit-presentation.js';

/** Longest date range a query may span. */
export const MAX_RANGE_DAYS = 90;
/** The filter dropdowns only offer values seen recently, so building them stays cheap. */
export const FILTER_OPTIONS_WINDOW_DAYS = 180;

const DAY_MS = 86_400_000;
// Colombia has no daylight saving time: a calendar day starts at 05:00 UTC.
const BOGOTA_OFFSET = '-05:00';
export const PLATFORM_TEAM_LABEL = 'Equipo de plataforma';

export interface AuditQueryInput {
  /** yyyy-MM-dd, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
  readonly userId: number | null;
  readonly action: string | null;
  readonly entity: string | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface AuditEntryView {
  readonly id: number;
  readonly createdAt: string;
  readonly userId: number | null;
  readonly userName: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  /** Sede name, "Toda la denominación" or "Plataforma". */
  readonly scopeLabel: string;
  /** Always masked. */
  readonly ipAddress: string;
  readonly changes: readonly AuditFieldChangeView[];
}

export interface AuditSummaryView {
  readonly total: number;
  readonly roleChanges: number;
  readonly contributionVoids: number;
  readonly periodClosures: number;
}

export interface AuditPageView extends Page<AuditEntryView> {
  readonly summary: AuditSummaryView;
}

export interface AuditFilterOptionsView {
  readonly users: readonly { id: number; name: string }[];
  readonly actions: readonly string[];
  readonly entities: readonly string[];
}

/** The platform reads everything; a denomination administrator its denomination, and a sede only that sede. */
export function auditScopeOf(context: TenantContext): AuditScope {
  if (context.kind === 'PLATFORM') {
    return { denominationId: null, congregationId: null };
  }
  const { denominationId, congregationId } = context.tenantScope();
  return { denominationId, congregationId };
}

function invalidRange(message: string): InvalidInputException {
  return new InvalidInputException(message, 'INVALID_RANGE');
}

function parseDay(day: string, time: string): Date {
  if (!isIsoDate(day)) {
    throw invalidRange('Escribe fechas válidas para el rango.');
  }
  return new Date(`${day}T${time}${BOGOTA_OFFSET}`);
}

/** Inclusive boundaries of the range, in Bogota days. */
export function resolveRange(
  from: string | null,
  to: string | null,
): { from: Date | null; to: Date | null } {
  const start = from ? parseDay(from, '00:00:00.000') : null;
  const end = to ? parseDay(to, '23:59:59.999') : null;
  if (start && end) {
    if (start > end) {
      throw invalidRange(
        'La fecha «Desde» no puede ser posterior a la fecha «Hasta».',
      );
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new InvalidInputException(
        `El rango máximo de consulta es de ${MAX_RANGE_DAYS} días.`,
        'RANGE_TOO_LONG',
      );
    }
  }
  return { from: start, to: end };
}

/** A denomination does not see the names of platform team members: they appear as one party. */
function userLabel(
  ref: AuditUserRef | undefined,
  userId: number,
  viewerIsPlatform: boolean,
): string {
  if (!ref) {
    return `Usuario ${userId}`;
  }
  return !viewerIsPlatform && ref.isPlatformAdmin
    ? PLATFORM_TEAM_LABEL
    : ref.name;
}

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_READER) private readonly reader: AuditLogReader,
  ) {}

  async execute(
    context: TenantContext,
    query: AuditQueryInput,
  ): Promise<AuditPageView> {
    const scope = auditScopeOf(context);
    const viewerIsPlatform = context.kind === 'PLATFORM';
    const { from, to } = resolveRange(query.from, query.to);

    const { rows, total, actionCounts } = await this.reader.search(scope, {
      from,
      to,
      userId: query.userId,
      action: query.action,
      entity: query.entity,
      page: query.page,
      pageSize: query.pageSize,
    });

    const [users, congregations] = await Promise.all([
      this.reader.findUsers(uniqueIds(rows.map((row) => row.userId))),
      this.reader.findCongregationNames(
        uniqueIds(rows.map((row) => row.congregationId)),
      ),
    ]);
    const items = rows.map((row) =>
      this.toView(row, users, congregations, viewerIsPlatform),
    );
    return {
      ...buildPage(items, total, query),
      summary: summarize(total, actionCounts),
    };
  }

  private toView(
    row: AuditRow,
    users: ReadonlyMap<number, AuditUserRef>,
    congregations: ReadonlyMap<number, string>,
    viewerIsPlatform: boolean,
  ): AuditEntryView {
    return {
      id: row.id,
      createdAt: toIsoDateTime(row.createdAt),
      userId: row.userId,
      userName:
        row.userId === null
          ? 'Sistema'
          : userLabel(users.get(row.userId), row.userId, viewerIsPlatform),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      scopeLabel: scopeLabel(row, congregations),
      ipAddress: maskIpAddress(row.ipAddress),
      changes: formatChanges(row.changes),
    };
  }
}

function uniqueIds(ids: readonly (number | null)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id !== null))];
}

function scopeLabel(
  row: AuditRow,
  congregations: ReadonlyMap<number, string>,
): string {
  if (row.congregationId !== null) {
    return congregations.get(row.congregationId) ?? 'Sede';
  }
  return row.denominationId === null ? 'Plataforma' : 'Toda la denominación';
}

function summarize(
  total: number,
  actionCounts: ReadonlyMap<string, number>,
): AuditSummaryView {
  const count = (action: string) => actionCounts.get(action) ?? 0;
  return {
    total,
    roleChanges: ROLE_CHANGE_ACTIONS.reduce(
      (sum, action) => sum + count(action),
      0,
    ),
    contributionVoids: count(CONTRIBUTION_VOID_ACTION),
    periodClosures: count(PERIOD_CLOSE_ACTION),
  };
}

@Injectable()
export class GetAuditFilterOptionsUseCase {
  constructor(
    @Inject(AUDIT_LOG_READER) private readonly reader: AuditLogReader,
    private readonly clock: Clock,
  ) {}

  async execute(context: TenantContext): Promise<AuditFilterOptionsView> {
    const viewerIsPlatform = context.kind === 'PLATFORM';
    const since = new Date(
      this.clock.now().getTime() - FILTER_OPTIONS_WINDOW_DAYS * DAY_MS,
    );
    const values = await this.reader.findFilterValues(
      auditScopeOf(context),
      since,
    );
    const users = await this.reader.findUsers(values.userIds);
    return {
      users: values.userIds
        .map((id) => ({
          id,
          name: userLabel(users.get(id), id, viewerIsPlatform),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      actions: [...values.actions].sort(),
      entities: [...values.entities].sort(),
    };
  }
}
