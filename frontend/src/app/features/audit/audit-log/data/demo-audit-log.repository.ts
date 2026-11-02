import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AuditChange, AuditLogEntry } from '../../../../core/models/identity.model';
import { paginate } from '../../../../shared/utils/pagination';
import {
  AuditEntryView,
  AuditFieldChange,
  AuditFilterOptions,
  AuditPage,
  AuditQuery,
  AuditSummary,
  MAX_RANGE_DAYS,
  ROLE_CHANGE_ACTIONS,
  auditActionLabel,
  auditEntityLabel,
  maskIpAddress,
} from './audit-log.models';
import { AuditLogRepository } from './audit-log.repository';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Demo adapter: reads the shared audit table with the tenant isolation of the API. */
@Injectable()
export class DemoAuditLogRepository extends AuditLogRepository {
  private readonly db = inject(DemoDatabase);
  private readonly auth = inject(AuthService);

  list(query: AuditQuery): Observable<AuditPage> {
    return demoCommand(() => {
      const scoped = this.scopedEntries();
      const { from, to } = dateRange(query.from, query.to);
      const rows = scoped
        .filter((entry) => {
          const at = Date.parse(entry.createdAt);
          return (
            (from === null || at >= from) &&
            (to === null || at <= to) &&
            (query.userId === null || entry.userId === query.userId) &&
            (!query.action || entry.action === query.action) &&
            (!query.entity || entry.entity === query.entity)
          );
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

      const page = paginate(rows, query);
      return { ...page, items: page.items.map((entry) => this.toView(entry)), summary: summarize(rows) };
    });
  }

  filterOptions(): Observable<AuditFilterOptions> {
    return demoCommand(() => {
      const scoped = this.scopedEntries();
      const userIds = [...new Set(scoped.map((entry) => entry.userId).filter((id): id is number => id !== null))];
      return {
        users: userIds
          .map((id) => ({ id, name: this.userName(id) }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
        actions: [...new Set(scoped.map((entry) => entry.action))].sort((a, b) =>
          auditActionLabel(a).localeCompare(auditActionLabel(b), 'es'),
        ),
        entities: [...new Set(scoped.map((entry) => entry.entity))].sort((a, b) =>
          auditEntityLabel(a).localeCompare(auditEntityLabel(b), 'es'),
        ),
      };
    });
  }

  /** Platform admin: everything. Denomination admin: their denomination (and sede, if one is active). */
  private scopedEntries(): AuditLogEntry[] {
    if (!this.auth.can('audit-logs.read')) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para consultar la auditoría.');
    }
    if (this.auth.activeScope()?.kind === 'PLATFORM' && this.auth.activeRoles().includes('PLATFORM_ADMIN')) {
      return [...this.db.auditLogs];
    }
    const { denominationId, congregationId } = this.auth.tenant();
    if (denominationId === null) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para consultar la auditoría.');
    }
    return this.db.auditLogs.filter(
      (entry) =>
        entry.denominationId === denominationId &&
        (congregationId === null || entry.congregationId === congregationId),
    );
  }

  private toView(entry: AuditLogEntry): AuditEntryView {
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      userId: entry.userId,
      userName: entry.userId === null ? 'Sistema' : this.userName(entry.userId),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      scopeLabel: this.scopeLabel(entry),
      ipAddress: maskIpAddress(entry.ipAddress),
      changes: Object.entries(entry.changes ?? {}).map(([field, change]) => formatChange(field, change)),
    };
  }

  private userName(userId: number): string {
    return this.db.users.find((user) => user.id === userId)?.displayName ?? `Usuario ${userId}`;
  }

  private scopeLabel(entry: AuditLogEntry): string {
    if (entry.congregationId !== null) {
      return this.db.congregation(entry.congregationId)?.name ?? 'Sede';
    }
    return entry.denominationId === null ? 'Plataforma' : 'Toda la denominación';
  }
}

/** Inclusive local-day boundaries of the range, validated like the API would. */
function dateRange(from: string | null, to: string | null): { from: number | null; to: number | null } {
  const start = from ? parseDay(from, 'T00:00:00') : null;
  const end = to ? parseDay(to, 'T23:59:59.999') : null;
  if (start !== null && end !== null) {
    if (start > end) {
      throw new DomainError('INVALID_RANGE', 'La fecha «Desde» no puede ser posterior a la fecha «Hasta».');
    }
    if (end - start > MAX_RANGE_DAYS * DAY_MS) {
      throw new DomainError('RANGE_TOO_LONG', `El rango máximo de consulta es de ${MAX_RANGE_DAYS} días.`);
    }
  }
  return { from: start, to: end };
}

function parseDay(day: string, time: string): number {
  const value = DATE_PATTERN.test(day) ? new Date(`${day}${time}`).getTime() : Number.NaN;
  if (Number.isNaN(value)) {
    throw new DomainError('INVALID_RANGE', 'Escribe fechas válidas para el rango.');
  }
  return value;
}

function summarize(rows: readonly AuditLogEntry[]): AuditSummary {
  return {
    total: rows.length,
    roleChanges: rows.filter((entry) => ROLE_CHANGE_ACTIONS.includes(entry.action)).length,
    contributionVoids: rows.filter((entry) => entry.action === 'CONTRIBUTION_VOIDED').length,
    periodClosures: rows.filter((entry) => entry.action === 'PERIOD_CLOSED').length,
  };
}

function formatChange(field: string, change: AuditChange): AuditFieldChange {
  return { field, from: formatValue(change.from), to: formatValue(change.to) };
}

function formatValue(value: AuditChange['from']): string {
  if (value === null) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  return String(value);
}
