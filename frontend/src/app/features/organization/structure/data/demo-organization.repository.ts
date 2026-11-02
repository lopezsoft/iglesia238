import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AuditChange } from '../../../../core/models/identity.model';
import { DEMO_MUNICIPALITIES } from '../../../../core/models/catalogs';
import { Congregation, District, LegalEntity } from '../../../../core/models/organization.model';
import {
  CongregationFormOptions,
  CongregationInput,
  CongregationRow,
  DistrictInput,
  DistrictRow,
  FIELD_LIMITS,
  LegalEntityInput,
  LegalEntityRow,
  OrganizationOverview,
  TAX_ID_PATTERN,
  districtLabel,
  formatTaxId,
  taxIdDigits,
} from './organization.models';
import { OrganizationRepository } from './organization.repository';

type AuditAction = 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE';
type Changes = Record<string, AuditChange>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Simulates the organization endpoints of the API over the shared in-memory tables. Every
 * read and write is limited to the denomination of the active tenant.
 */
@Injectable()
export class DemoOrganizationRepository extends OrganizationRepository {
  private readonly db = inject(DemoDatabase);
  private readonly auth = inject(AuthService);

  override overview(): Observable<OrganizationOverview> {
    return demoCommand(() => {
      const denominationId = this.requireTenant();
      const congregations = this.congregationsOf(denominationId);
      return {
        denominationName:
          this.db.denominations.find((row) => row.id === denominationId)?.name ?? '',
        activeCongregations: congregations.filter((row) => row.isActive).length,
        totalCongregations: congregations.length,
        acceptingApplications: congregations.filter(
          (row) => row.isActive && row.acceptsApplications,
        ).length,
        legalEntities: this.legalEntitiesOf(denominationId).length,
        districts: this.districtsOf(denominationId).length,
      };
    });
  }

  // Sedes

  override listCongregations(): Observable<CongregationRow[]> {
    return demoCommand(() => {
      const denominationId = this.requireTenant();
      return this.congregationsOf(denominationId)
        .sort(byText((row) => row.name))
        .map((row) => this.toCongregationRow(row));
    });
  }

  override congregationFormOptions(): Observable<CongregationFormOptions> {
    return demoCommand(() => {
      const denominationId = this.requireTenant();
      return {
        legalEntities: this.legalEntitiesOf(denominationId)
          .sort(byText((row) => row.legalName))
          .map((row) => ({ id: row.id, label: row.legalName, isActive: row.isActive })),
        districts: this.districtsOf(denominationId)
          .sort(byNumber)
          .map((row) => ({ id: row.id, label: districtLabel(row), isActive: true })),
      };
    });
  }

  override createCongregation(input: CongregationInput): Observable<CongregationRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant('crear sedes');
      const fields = this.validCongregation(denominationId, input, null);
      const congregation: Congregation = {
        id: this.db.nextId(this.db.congregations),
        denominationId,
        ...fields,
        isActive: true,
      };
      this.db.congregations.push(congregation);
      this.auditCongregation(congregation, 'CREATE', {
        name: { from: null, to: congregation.name },
        legalEntityId: { from: null, to: congregation.legalEntityId },
        districtId: { from: null, to: congregation.districtId },
        acceptsApplications: { from: null, to: congregation.acceptsApplications },
      });
      return this.toCongregationRow(congregation);
    });
  }

  override updateCongregation(id: number, input: CongregationInput): Observable<CongregationRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant('editar sedes');
      const current = this.findCongregation(denominationId, id);
      const fields = this.validCongregation(denominationId, input, current);
      const updated = this.db.replace(this.db.congregations, { ...current, ...fields });
      const changes = diff(current, updated, [
        'name',
        'legalEntityId',
        'districtId',
        'municipalityCode',
        'acceptsApplications',
      ]);
      this.auditCongregation(updated, 'UPDATE', changes);
      return this.toCongregationRow(updated);
    });
  }

  override setCongregationActive(id: number, isActive: boolean): Observable<CongregationRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant(isActive ? 'activar sedes' : 'desactivar sedes');
      const current = this.findCongregation(denominationId, id);
      if (current.isActive === isActive) {
        return this.toCongregationRow(current);
      }
      // An inactive sede never receives applications.
      const acceptsApplications = isActive ? current.acceptsApplications : false;
      const updated = this.db.replace(this.db.congregations, {
        ...current,
        isActive,
        acceptsApplications,
      });
      this.auditCongregation(
        updated,
        isActive ? 'ACTIVATE' : 'DEACTIVATE',
        diff(current, updated, ['isActive', 'acceptsApplications']),
      );
      return this.toCongregationRow(updated);
    });
  }

  override setAcceptsApplications(
    id: number,
    acceptsApplications: boolean,
  ): Observable<CongregationRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant('abrir o cerrar inscripciones');
      const current = this.findCongregation(denominationId, id);
      if (acceptsApplications && !current.isActive) {
        throw new DomainError(
          'CONGREGATION_INACTIVE',
          'La sede está inactiva: actívala antes de abrir inscripciones.',
        );
      }
      if (current.acceptsApplications === acceptsApplications) {
        return this.toCongregationRow(current);
      }
      const updated = this.db.replace(this.db.congregations, { ...current, acceptsApplications });
      this.auditCongregation(updated, 'UPDATE', diff(current, updated, ['acceptsApplications']));
      return this.toCongregationRow(updated);
    });
  }

  // Razones sociales

  override listLegalEntities(): Observable<LegalEntityRow[]> {
    return demoCommand(() => {
      const denominationId = this.requireTenant();
      return this.legalEntitiesOf(denominationId).sort(byText((row) => row.legalName));
    });
  }

  override createLegalEntity(input: LegalEntityInput): Observable<LegalEntityRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant('crear razones sociales');
      const fields = this.validLegalEntity(input, null);
      const legalEntity: LegalEntity = {
        id: this.db.nextId(this.db.legalEntities),
        denominationId,
        ...fields,
        isActive: true,
      };
      this.db.legalEntities.push(legalEntity);
      this.auditLegalEntity(legalEntity, 'CREATE', {
        taxId: { from: null, to: legalEntity.taxId },
        isActive: { from: null, to: true },
      });
      return legalEntity;
    });
  }

  override updateLegalEntity(id: number, input: LegalEntityInput): Observable<LegalEntityRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant('editar razones sociales');
      const current = this.findLegalEntity(denominationId, id);
      const fields = this.validLegalEntity(input, id);
      const updated = this.db.replace(this.db.legalEntities, { ...current, ...fields });
      this.auditLegalEntity(
        updated,
        'UPDATE',
        diff(current, updated, ['legalName', 'tradeName', 'taxId', 'municipalityCode']),
      );
      return updated;
    });
  }

  override setLegalEntityActive(id: number, isActive: boolean): Observable<LegalEntityRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant(
        isActive ? 'activar razones sociales' : 'desactivar razones sociales',
      );
      const current = this.findLegalEntity(denominationId, id);
      if (current.isActive === isActive) {
        return current;
      }
      const inUse = this.congregationsOf(denominationId).some(
        (row) => row.legalEntityId === id && row.isActive,
      );
      if (!isActive && inUse) {
        throw new DomainError(
          'LEGAL_ENTITY_IN_USE',
          'La razón social tiene sedes activas: asígnales otra razón social antes de desactivarla.',
        );
      }
      const updated = this.db.replace(this.db.legalEntities, { ...current, isActive });
      this.auditLegalEntity(
        updated,
        isActive ? 'ACTIVATE' : 'DEACTIVATE',
        diff(current, updated, ['isActive']),
      );
      return updated;
    });
  }

  // Distritos

  override listDistricts(): Observable<DistrictRow[]> {
    return demoCommand(() => {
      const denominationId = this.requireTenant();
      return this.districtsOf(denominationId)
        .sort(byNumber)
        .map((row) => this.toDistrictRow(row));
    });
  }

  override createDistrict(input: DistrictInput): Observable<DistrictRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant('crear distritos');
      const fields = this.validDistrict(denominationId, input, null);
      const district: District = {
        id: this.db.nextId(this.db.districts),
        denominationId,
        ...fields,
      };
      this.db.districts.push(district);
      this.auditDistrict(district, 'CREATE', { number: { from: null, to: district.number } });
      return this.toDistrictRow(district);
    });
  }

  override updateDistrict(id: number, input: DistrictInput): Observable<DistrictRow> {
    return demoCommand(() => {
      const denominationId = this.requireTenant('editar distritos');
      const current = this.findDistrict(denominationId, id);
      const fields = this.validDistrict(denominationId, input, id);
      const updated = this.db.replace(this.db.districts, { ...current, ...fields });
      this.auditDistrict(updated, 'UPDATE', diff(current, updated, ['number', 'name']));
      return this.toDistrictRow(updated);
    });
  }

  // Tenant and permission

  /** Denomination of the active tenant, after checking `congregations.manage`. */
  private requireTenant(action = 'consultar la estructura de la denominación'): number {
    if (!this.auth.can('congregations.manage')) {
      throw new DomainError('FORBIDDEN', `No tienes permiso para ${action}.`);
    }
    const denominationId = this.auth.tenant().denominationId;
    if (denominationId === null) {
      throw new DomainError(
        'NO_TENANT',
        'Selecciona una denominación para administrar su estructura.',
      );
    }
    return denominationId;
  }

  private congregationsOf(denominationId: number): Congregation[] {
    return this.db.congregations.filter((row) => row.denominationId === denominationId);
  }

  private legalEntitiesOf(denominationId: number): LegalEntity[] {
    return this.db.legalEntities.filter((row) => row.denominationId === denominationId);
  }

  private districtsOf(denominationId: number): District[] {
    return this.db.districts.filter((row) => row.denominationId === denominationId);
  }

  /** Rows of another denomination answer as missing, so their existence is not revealed. */
  private findCongregation(denominationId: number, id: number): Congregation {
    const row = this.congregationsOf(denominationId).find((item) => item.id === id);
    if (!row) {
      throw new DomainError('NOT_FOUND', 'La sede no existe en tu denominación.');
    }
    return row;
  }

  private findLegalEntity(denominationId: number, id: number): LegalEntity {
    const row = this.legalEntitiesOf(denominationId).find((item) => item.id === id);
    if (!row) {
      throw new DomainError('NOT_FOUND', 'La razón social no existe en tu denominación.');
    }
    return row;
  }

  private findDistrict(denominationId: number, id: number): District {
    const row = this.districtsOf(denominationId).find((item) => item.id === id);
    if (!row) {
      throw new DomainError('NOT_FOUND', 'El distrito no existe en tu denominación.');
    }
    return row;
  }

  // Validation

  private validCongregation(
    denominationId: number,
    input: CongregationInput,
    current: Congregation | null,
  ): Omit<Congregation, 'id' | 'denominationId' | 'isActive'> {
    const name = requiredText(input.name, 'El nombre de la sede', FIELD_LIMITS.congregationName);
    const key = comparable(name);
    if (
      this.congregationsOf(denominationId).some(
        (row) => row.id !== current?.id && comparable(row.name) === key,
      )
    ) {
      throw new DomainError(
        'DUPLICATE_NAME',
        'Ya existe una sede con ese nombre en la denominación.',
      );
    }

    const legalEntity = this.db.legalEntities.find((row) => row.id === input.legalEntityId);
    if (!legalEntity || legalEntity.denominationId !== denominationId) {
      throw new DomainError('CROSS_TENANT', 'La razón social no pertenece a tu denominación.');
    }
    if (!legalEntity.isActive && legalEntity.id !== current?.legalEntityId) {
      throw new DomainError('LEGAL_ENTITY_INACTIVE', 'La razón social está inactiva.');
    }

    if (input.districtId !== null) {
      const district = this.db.districts.find((row) => row.id === input.districtId);
      if (!district || district.denominationId !== denominationId) {
        throw new DomainError('CROSS_TENANT', 'El distrito no pertenece a tu denominación.');
      }
    }

    const acceptsApplications = input.acceptsApplications && (current?.isActive ?? true);
    return {
      name,
      legalEntityId: legalEntity.id,
      districtId: input.districtId,
      municipalityCode: validMunicipality(input.municipalityCode),
      neighborhood: optionalText(input.neighborhood, FIELD_LIMITS.neighborhood),
      address: requiredText(input.address, 'La dirección', FIELD_LIMITS.address),
      phone: optionalText(input.phone, FIELD_LIMITS.phone),
      email: validEmail(input.email),
      acceptsApplications,
    };
  }

  private validLegalEntity(
    input: LegalEntityInput,
    exceptId: number | null,
  ): Omit<LegalEntity, 'id' | 'denominationId' | 'isActive'> {
    const rawTaxId = input.taxId.trim();
    if (!TAX_ID_PATTERN.test(rawTaxId) || rawTaxId.length > FIELD_LIMITS.taxId) {
      throw new DomainError(
        'INVALID_TAX_ID',
        'El NIT debe tener el formato 900.123.456-7, con dígito de verificación.',
      );
    }
    const digits = taxIdDigits(rawTaxId);
    // NIT is unique across every denomination of the platform.
    if (
      this.db.legalEntities.some((row) => row.id !== exceptId && taxIdDigits(row.taxId) === digits)
    ) {
      throw new DomainError(
        'DUPLICATE_TAX_ID',
        'Ya existe una razón social registrada con ese NIT.',
      );
    }
    return {
      legalName: requiredText(input.legalName, 'La razón social', FIELD_LIMITS.legalName),
      tradeName: optionalText(input.tradeName, FIELD_LIMITS.legalName),
      taxId: formatTaxId(rawTaxId),
      legalRepresentative: requiredText(
        input.legalRepresentative,
        'El representante legal',
        FIELD_LIMITS.legalName,
      ),
      municipalityCode: validMunicipality(input.municipalityCode),
      email: validEmail(input.email),
      phone: optionalText(input.phone, FIELD_LIMITS.phone),
      address: optionalText(input.address, FIELD_LIMITS.address),
    };
  }

  private validDistrict(
    denominationId: number,
    input: DistrictInput,
    exceptId: number | null,
  ): Omit<District, 'id' | 'denominationId'> {
    const number = requiredText(
      input.number,
      'El número del distrito',
      FIELD_LIMITS.districtNumber,
    );
    const key = comparable(number);
    if (
      this.districtsOf(denominationId).some(
        (row) => row.id !== exceptId && comparable(row.number) === key,
      )
    ) {
      throw new DomainError(
        'DUPLICATE_DISTRICT_NUMBER',
        'Ya existe un distrito con ese número en la denominación.',
      );
    }
    return { number, name: optionalText(input.name, FIELD_LIMITS.districtName) };
  }

  // Projections and audit

  private toCongregationRow(congregation: Congregation): CongregationRow {
    const legalEntity = this.db.legalEntities.find((row) => row.id === congregation.legalEntityId);
    const district = this.db.districts.find((row) => row.id === congregation.districtId);
    return {
      ...congregation,
      legalEntityName: legalEntity?.legalName ?? '—',
      districtNumber: district?.number ?? null,
    };
  }

  private toDistrictRow(district: District): DistrictRow {
    return {
      ...district,
      congregationNames: this.congregationsOf(district.denominationId)
        .filter((row) => row.districtId === district.id)
        .map((row) => row.name)
        .sort((a, b) => a.localeCompare(b, 'es')),
    };
  }

  private auditCongregation(row: Congregation, action: AuditAction, changes: Changes | null): void {
    this.audit('Congregation', row.id, row.denominationId, row.id, action, changes);
  }

  private auditLegalEntity(row: LegalEntity, action: AuditAction, changes: Changes | null): void {
    this.audit('LegalEntity', row.id, row.denominationId, null, action, changes);
  }

  private auditDistrict(row: District, action: AuditAction, changes: Changes | null): void {
    this.audit('District', row.id, row.denominationId, null, action, changes);
  }

  /** `changes` never carries personal data: no representative, address, phone or email. */
  private audit(
    entity: string,
    entityId: number,
    denominationId: number,
    congregationId: number | null,
    action: AuditAction,
    changes: Changes | null,
  ): void {
    this.db.audit({
      userId: this.auth.user()?.id ?? null,
      denominationId,
      congregationId,
      entity,
      entityId: String(entityId),
      action,
      changes,
    });
  }
}

function requiredText(value: string, label: string, maxLength: number): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (text === '') {
    throw new DomainError('REQUIRED', `${label} es obligatorio.`);
  }
  if (text.length > maxLength) {
    throw new DomainError('TOO_LONG', `${label} admite máximo ${maxLength} caracteres.`);
  }
  return text;
}

function optionalText(value: string | null, maxLength: number): string | null {
  const text = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (text.length > maxLength) {
    throw new DomainError('TOO_LONG', `Un campo supera el máximo de ${maxLength} caracteres.`);
  }
  return text === '' ? null : text;
}

function validEmail(value: string | null): string | null {
  const email = optionalText(value, FIELD_LIMITS.email);
  if (email !== null && !EMAIL_PATTERN.test(email)) {
    throw new DomainError('INVALID_EMAIL', 'El correo no tiene un formato válido.');
  }
  return email?.toLowerCase() ?? null;
}

function validMunicipality(code: string): string {
  if (!DEMO_MUNICIPALITIES.some((municipality) => municipality.code === code)) {
    throw new DomainError('INVALID_MUNICIPALITY', 'Selecciona un municipio válido.');
  }
  return code;
}

/** Case- and accent-insensitive key for uniqueness rules. */
function comparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function byText<T>(key: (row: T) => string): (a: T, b: T) => number {
  return (a, b) => key(a).localeCompare(key(b), 'es');
}

function byNumber(a: District, b: District): number {
  return a.number.localeCompare(b.number, 'es', { numeric: true });
}

/** Changed fields among `keys`, or null when nothing tracked changed. */
function diff<K extends string, T extends Readonly<Record<K, AuditChange['from']>>>(
  before: T,
  after: T,
  keys: readonly K[],
): Changes | null {
  const changes: Changes = {};
  for (const key of keys) {
    const from = before[key];
    const to = after[key];
    if (from !== to) {
      changes[key] = { from, to };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
