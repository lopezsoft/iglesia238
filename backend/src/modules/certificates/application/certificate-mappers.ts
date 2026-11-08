import { toIsoDateTimeOrNull } from '../../../common/mappers/value-mappers.js';
import {
  formatCertificateCode,
  formatMemberCode,
} from '../../../common/numbering/document-numbering.service.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { daysBetween, maskedDocumentLabel } from './certificate-document.js';
import type {
  CardRecord,
  CardStatus,
  CardListItemView,
  CertificateDetailView,
  CertificateListItemView,
  CertificateMember,
  CertificateRecord,
  CertificateTypeRecord,
  CertificateTypeTemplateView,
  MemberOptionView,
} from './certificate.models.js';

/**
 * Scope of a read. A congregation scope is fixed; a denomination scope sees every sede unless the
 * caller narrows the query to one of them (a sede of another denomination is simply not found).
 */
export function readScope(
  tenant: TenantContext,
  congregationId?: number,
): TenantScope {
  return congregationId === undefined
    ? tenant.tenantScope()
    : tenant.congregationScope(congregationId);
}

/** CERT-MEM-2026-0031: derived from immutable columns, so it matches the number printed in the snapshot. */
export function certificateNumberOf(record: CertificateRecord): string {
  return formatCertificateCode(
    record.typeCode,
    record.issuedOn,
    record.sequenceNumber,
  );
}

export function toCertificateListItem(
  record: CertificateRecord,
): CertificateListItemView {
  return {
    id: record.id,
    number: certificateNumberOf(record),
    typeCode: record.typeCode,
    typeName: record.typeName,
    congregationId: record.congregationId,
    congregationName: record.congregationName,
    memberId: record.memberId,
    memberName: record.snapshot.memberName,
    memberCode: record.snapshot.memberCode,
    issuedOn: record.issuedOn,
    expiresOn: record.expiresOn,
    issuedByName: record.issuedByName ?? '—',
    status: record.voidedAt === null ? 'ISSUED' : 'VOIDED',
    voidReason: record.voidReason,
    voidedAt: toIsoDateTimeOrNull(record.voidedAt),
  };
}

export function toCertificateDetail(
  record: CertificateRecord,
): CertificateDetailView {
  return { ...toCertificateListItem(record), snapshot: record.snapshot };
}

/** VOIDED wins; then the expiry against today (an expiry date still counts on its last day). */
export function cardStatusOf(
  card: Pick<CardRecord, 'voidedAt' | 'expiresOn'>,
  today: string,
): CardStatus {
  if (card.voidedAt !== null) {
    return 'VOIDED';
  }
  return card.expiresOn < today ? 'EXPIRED' : 'VALID';
}

export function cardNumberOf(card: CardRecord): string {
  return formatMemberCode(card.congregationCode, card.memberNumber);
}

export function toCardListItem(
  card: CardRecord,
  today: string,
): CardListItemView {
  const status = cardStatusOf(card, today);
  return {
    id: card.id,
    memberId: card.memberId,
    memberName: card.memberName,
    cardNumber: cardNumberOf(card),
    congregationId: card.congregationId,
    congregationName: card.congregationName,
    issuedOn: card.issuedOn,
    expiresOn: card.expiresOn,
    status,
    daysToExpire:
      status === 'VALID' ? daysBetween(today, card.expiresOn) : null,
    voidReason: card.voidReason,
  };
}

export function toMemberOption(member: CertificateMember): MemberOptionView {
  return {
    id: member.id,
    fullName: member.fullName,
    code: member.code,
    documentLabel: maskedDocumentLabel(
      member.documentTypeCode,
      member.documentNumber,
    ),
    joinedOn: member.joinedOn,
    isBaptized: member.isBaptized === true,
    waterBaptismOn: member.waterBaptismOn,
  };
}

export function toTypeTemplateView(
  record: CertificateTypeRecord,
): CertificateTypeTemplateView {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    validityDays: record.validityDays,
    template: record.template,
    introTemplate: record.introTemplate,
    closingTemplate: record.closingTemplate,
    pastorTitleTemplate: record.pastorTitleTemplate,
    secretaryTitleTemplate: record.secretaryTitleTemplate,
  };
}
