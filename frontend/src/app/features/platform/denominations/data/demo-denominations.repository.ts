import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { Denomination } from '../../../../core/models/organization.model';
import { Page, matchesText, paginate } from '../../../../shared/utils/pagination';
import {
  DENOMINATION_NAME_MAX_LENGTH,
  DenominationInput,
  DenominationQuery,
  DenominationStats,
  DenominationSummary,
} from './denominations.models';
import { DenominationsDemoStore } from './denominations-demo-store';
import { DenominationsRepository } from './denominations.repository';

/** Version label of the privacy policy draft created with each denomination. */
export const PRIVACY_POLICY_DRAFT_VERSION = 'borrador';

const PRIVACY_POLICY_DRAFT_CONTENT =
  'Borrador de la política de tratamiento de datos personales (Ley 1581 de 2012). ' +
  'El administrador de la denominación debe completarla y publicarla antes de recibir inscripciones.';

/** Simulates the platform endpoints of the API over the shared in-memory tables. */
@Injectable()
export class DemoDenominationsRepository extends DenominationsRepository {
  private readonly db = inject(DemoDatabase);
  private readonly store = inject(DenominationsDemoStore);
  private readonly auth = inject(AuthService);

  override list(query: DenominationQuery): Observable<Page<DenominationSummary>> {
    return demoCommand(() => {
      this.requirePermission('consultar las denominaciones');
      const rows = this.db.denominations
        .filter((denomination) => matchesText([denomination.name], query.search))
        .filter(
          (denomination) =>
            query.status === 'all' || denomination.isActive === (query.status === 'active'),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map((denomination) => this.toSummary(denomination));
      return paginate(rows, query);
    });
  }

  override stats(): Observable<DenominationStats> {
    return demoCommand(() => {
      this.requirePermission('consultar las denominaciones');
      return {
        total: this.db.denominations.length,
        active: this.db.denominations.filter((denomination) => denomination.isActive).length,
        congregations: this.db.congregations.length,
      };
    });
  }

  override create(input: DenominationInput): Observable<DenominationSummary> {
    return demoCommand(() => {
      this.requirePermission('crear denominaciones');
      const name = this.validName(input.name, null);
      const now = new Date().toISOString();
      const denomination: Denomination = {
        id: this.db.nextId(this.db.denominations),
        name,
        logoPath: null,
        isActive: true,
        createdAt: now,
      };
      this.db.denominations.push(denomination);
      // Kept as a draft: it only reaches the PrivacyPolicy table (and the public form) once
      // the denomination admin publishes it, so no applicant consents to unfinished text.
      this.store.privacyPolicyDrafts.push({
        denominationId: denomination.id,
        version: PRIVACY_POLICY_DRAFT_VERSION,
        content: PRIVACY_POLICY_DRAFT_CONTENT,
        createdAt: now,
      });
      this.auditChange(denomination.id, 'CREATE', { isActive: { from: null, to: true } });
      return this.toSummary(denomination);
    });
  }

  override rename(id: number, input: DenominationInput): Observable<DenominationSummary> {
    return demoCommand(() => {
      this.requirePermission('editar denominaciones');
      const current = this.find(id);
      const name = this.validName(input.name, id);
      if (name === current.name) {
        return this.toSummary(current);
      }
      const updated = this.db.replace(this.db.denominations, { ...current, name });
      this.auditChange(id, 'UPDATE', { name: { from: current.name, to: name } });
      return this.toSummary(updated);
    });
  }

  override setActive(id: number, isActive: boolean): Observable<DenominationSummary> {
    return demoCommand(() => {
      this.requirePermission(isActive ? 'activar denominaciones' : 'desactivar denominaciones');
      const current = this.find(id);
      if (current.isActive === isActive) {
        return this.toSummary(current);
      }
      const updated = this.db.replace(this.db.denominations, { ...current, isActive });
      this.auditChange(id, isActive ? 'ACTIVATE' : 'DEACTIVATE', {
        isActive: { from: current.isActive, to: isActive },
      });
      return this.toSummary(updated);
    });
  }

  private requirePermission(action: string): void {
    if (!this.auth.can('denominations.manage')) {
      throw new DomainError('FORBIDDEN', `No tienes permiso para ${action}.`);
    }
  }

  private find(id: number): Denomination {
    const denomination = this.db.denominations.find((row) => row.id === id);
    if (!denomination) {
      throw new DomainError('NOT_FOUND', 'La denominación no existe.');
    }
    return denomination;
  }

  /** Trimmed name, unique across the platform ignoring case and accents. */
  private validName(raw: string, exceptId: number | null): string {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name === '') {
      throw new DomainError('NAME_REQUIRED', 'El nombre es obligatorio.');
    }
    if (name.length > DENOMINATION_NAME_MAX_LENGTH) {
      throw new DomainError(
        'NAME_TOO_LONG',
        `El nombre admite máximo ${DENOMINATION_NAME_MAX_LENGTH} caracteres.`,
      );
    }
    const key = comparableName(name);
    if (
      this.db.denominations.some((row) => row.id !== exceptId && comparableName(row.name) === key)
    ) {
      throw new DomainError('DUPLICATE_NAME', 'Ya existe una denominación con ese nombre');
    }
    return name;
  }

  private toSummary(denomination: Denomination): DenominationSummary {
    return {
      id: denomination.id,
      name: denomination.name,
      isActive: denomination.isActive,
      createdAt: denomination.createdAt,
      legalEntityCount: this.db.legalEntities.filter(
        (row) => row.denominationId === denomination.id,
      ).length,
      congregationCount: this.db.congregations.filter(
        (row) => row.denominationId === denomination.id,
      ).length,
    };
  }

  private auditChange(
    denominationId: number,
    action: 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE',
    changes: Parameters<DemoDatabase['audit']>[0]['changes'],
  ): void {
    this.db.audit({
      userId: this.auth.user()?.id ?? null,
      denominationId,
      congregationId: null,
      entity: 'Denomination',
      entityId: String(denominationId),
      action,
      changes,
    });
  }
}

function comparableName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
