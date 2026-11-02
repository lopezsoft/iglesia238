// Audit log (A-06), mirroring AuditLog of backend/prisma/schema/identity.prisma.
import { BadgeTone } from '../../../../shared/ui/status-badge.component';
import { Page } from '../../../../shared/utils/pagination';

export const AUDIT_PAGE_SIZE = 20;
/** Longest date range the API accepts in one query. */
export const MAX_RANGE_DAYS = 90;

export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  ACTIVATE: 'Activación',
  DEACTIVATE: 'Desactivación',
  ROLE_GRANTED: 'Rol otorgado',
  ROLE_REVOKED: 'Rol revocado',
  USER_INVITED: 'Usuario invitado',
  APPLICATION_SUBMITTED: 'Envío de solicitud',
  APPLICATION_REVIEW_STARTED: 'Revisión de solicitud',
  APPLICATION_APPROVED: 'Aprobación de solicitud',
  APPLICATION_REJECTED: 'Rechazo de solicitud',
  APPLICATION_DUPLICATE: 'Solicitud duplicada',
  APPLICATION_MARKED_DUPLICATE: 'Solicitud duplicada',
  MEMBER_UPDATED: 'Actualización de miembro',
  MEMBER_TRANSFERRED: 'Traslado de miembro',
  MEMBERS_EXPORTED: 'Exportación de miembros',
  SOCIOECONOMIC_PROFILE_VIEWED: 'Consulta de perfil socioeconómico',
  CONSENT_REVOKED: 'Revocación de consentimiento',
  CERTIFICATE_ISSUED: 'Emisión de certificado',
  CERTIFICATE_VOIDED: 'Anulación de certificado',
  MEMBERSHIP_CARD_ISSUED: 'Emisión de carné',
  MEMBERSHIP_CARD_VOIDED: 'Anulación de carné',
  MARRIAGE_RECORDED: 'Registro de matrimonio',
  MARRIAGE_DISSOLVED: 'Disolución de matrimonio',
  CHILD_DEDICATION_RECORDED: 'Registro de presentación de niño',
  PASTORAL_TERM_RECORDED: 'Registro de periodo pastoral',
  PASTORAL_TERM_CLOSED: 'Cierre de periodo pastoral',
  ATTENDANCE_RECORDED: 'Registro de asistencia',
  ATTENDANCE_UPDATED: 'Actualización de asistencia',
  ACCOUNT_CREATED: 'Creación de cuenta contable',
  ACCOUNT_UPDATED: 'Actualización de cuenta contable',
  ACCOUNT_DELETED: 'Eliminación de cuenta contable',
  FUND_CREATED: 'Creación de fondo',
  FUND_UPDATED: 'Actualización de fondo',
  FUND_DELETED: 'Eliminación de fondo',
  CONTRIBUTION_TYPE_CREATED: 'Creación de tipo de aporte',
  CONTRIBUTION_TYPE_UPDATED: 'Actualización de tipo de aporte',
  CONTRIBUTION_RECORDED: 'Registro de aporte',
  CONTRIBUTION_VOIDED: 'Anulación de aporte',
  CONTRIBUTIONS_CONSOLIDATED: 'Consolidación de aportes',
  VOW_PLEDGE_CREATED: 'Registro de voto',
  CASH_TRANSACTION_POSTED: 'Movimiento de caja',
  CASH_TRANSACTION_REVERSED: 'Reversa de movimiento de caja',
  PERIOD_CLOSED: 'Cierre de periodo',
  TITHE_SETTLED: 'Liquidación del diezmo',
  TITHE_SETTLEMENT_VOIDED: 'Anulación de liquidación del diezmo',
  BUDGET_LINE_CREATED: 'Creación de rubro de presupuesto',
  BUDGET_LINE_UPDATED: 'Actualización de rubro de presupuesto',
  BUDGET_LINE_DELETED: 'Eliminación de rubro de presupuesto',
  BUDGET_CLOSED: 'Cierre de presupuesto',
};

const AUDIT_ACTION_TONES: Readonly<Record<string, BadgeTone>> = {
  ROLE_GRANTED: 'warning',
  ROLE_REVOKED: 'warning',
  USER_INVITED: 'warning',
  APPLICATION_APPROVED: 'success',
  ACTIVATE: 'success',
  CERTIFICATE_ISSUED: 'info',
  CONTRIBUTION_RECORDED: 'info',
  TITHE_SETTLED: 'info',
  APPLICATION_REJECTED: 'danger',
  CERTIFICATE_VOIDED: 'danger',
  CONTRIBUTION_VOIDED: 'danger',
  CONSENT_REVOKED: 'danger',
  DEACTIVATE: 'danger',
};

export const AUDIT_ENTITY_LABELS: Readonly<Record<string, string>> = {
  Denomination: 'Denominación',
  LegalEntity: 'Razón social',
  District: 'Distrito',
  Congregation: 'Sede',
  User: 'Usuario',
  UserRole: 'Asignación de rol',
  MembershipApplication: 'Solicitud de membresía',
  Member: 'Miembro',
  Person: 'Persona',
  DataConsent: 'Consentimiento de datos',
  Certificate: 'Certificado',
  Contribution: 'Aporte',
  Vow: 'Voto',
  CashTransaction: 'Movimiento de caja',
  AccountingPeriod: 'Periodo contable',
  TitheSettlement: 'Liquidación del diezmo',
  Budget: 'Presupuesto',
};

/** Spanish label of an action; unknown codes are shown raw. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditActionTone(action: string): BadgeTone {
  return AUDIT_ACTION_TONES[action] ?? 'neutral';
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? entity;
}

/**
 * Keeps the network part of an address: 181.52.10.24 → 181.52.•••.•••. IPv6 keeps the first
 * two groups. Anything else is fully hidden.
 */
export function maskIpAddress(ip: string | null): string {
  if (!ip) {
    return '—';
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip.trim());
  if (ipv4) {
    return `${ipv4[1]}.${ipv4[2]}.•••.•••`;
  }
  const groups = ip.trim().split(':');
  if (groups.length > 2 && groups[0] && groups[1]) {
    return `${groups[0]}:${groups[1]}:••••`;
  }
  return '•••';
}

/** A field diff, values already formatted for display. */
export interface AuditFieldChange {
  readonly field: string;
  readonly from: string;
  readonly to: string;
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
  /** Masked by the data source: the UI never receives a full address. */
  readonly ipAddress: string;
  readonly changes: readonly AuditFieldChange[];
}

export interface AuditQuery {
  /** yyyy-MM-dd, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
  readonly userId: number | null;
  readonly action: string | null;
  readonly entity: string | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface AuditSummary {
  readonly total: number;
  readonly roleChanges: number;
  readonly contributionVoids: number;
  readonly periodClosures: number;
}

export interface AuditPage extends Page<AuditEntryView> {
  readonly summary: AuditSummary;
}

export interface AuditUserOption {
  readonly id: number;
  readonly name: string;
}

export interface AuditFilterOptions {
  readonly users: readonly AuditUserOption[];
  readonly actions: readonly string[];
  readonly entities: readonly string[];
}

export const ROLE_CHANGE_ACTIONS: readonly string[] = ['ROLE_GRANTED', 'ROLE_REVOKED', 'USER_INVITED'];
