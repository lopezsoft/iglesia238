import { ApiProperty } from '@nestjs/swagger';
import { PageResponseDto } from '../../../common/pagination/page.js';
import type {
  CardListItemView,
  CardStatus,
  CertificateDetailView,
  CertificateListItemView,
  CertificatePreviewView,
  CertificateStatus,
  CertificateTypeOptionView,
  CertificateTypeView,
  CertificatesSummaryView,
  IssuingContextView,
  MemberOptionView,
} from '../application/certificate.models.js';
import type { CertificateSnapshot } from '../application/certificate-document.js';

export class CertificateTypeDto implements CertificateTypeView {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'MEM' }) code!: string;
  @ApiProperty({ example: 'Certificado de membresía' }) name!: string;
  @ApiProperty({ nullable: true, type: Number }) validityDays!: number | null;
  @ApiProperty() hasTemplate!: boolean;
}

export class CertificateTypeOptionDto implements CertificateTypeOptionView {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    example: 'CERT-MEM-2026-0031',
    description: 'Informativo: no está reservado.',
  })
  nextNumber!: string;
}

class LetterheadDto {
  @ApiProperty() denominationName!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() taxId!: string;
  @ApiProperty() congregationName!: string;
  @ApiProperty() cityName!: string;
  @ApiProperty() locationLine!: string;
}

class SignersDto {
  @ApiProperty({ nullable: true, type: String }) pastorName!: string | null;
  @ApiProperty({ nullable: true, type: String }) secretaryName!: string | null;
}

export class IssuingContextDto implements IssuingContextView {
  @ApiProperty() congregationId!: number;
  @ApiProperty() year!: number;
  @ApiProperty({
    example: '2026-11-02',
    description: 'Hoy en Bogotá, según el servidor.',
  })
  today!: string;
  @ApiProperty({ type: LetterheadDto }) letterhead!: LetterheadDto;
  @ApiProperty({ type: SignersDto }) signers!: SignersDto;
  @ApiProperty() issuedByName!: string;
  @ApiProperty({ type: [CertificateTypeOptionDto] })
  types!: CertificateTypeOptionDto[];
}

export class MemberOptionDto implements MemberOptionView {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ example: 'SC-0130' }) code!: string;
  @ApiProperty({
    example: 'CC ····8916',
    description: 'El documento siempre sale enmascarado.',
  })
  documentLabel!: string;
  @ApiProperty({ nullable: true, type: String }) joinedOn!: string | null;
  @ApiProperty() isBaptized!: boolean;
  @ApiProperty({ nullable: true, type: String }) waterBaptismOn!: string | null;
}

export class CertificateSnapshotDto implements CertificateSnapshot {
  @ApiProperty() number!: string;
  @ApiProperty() typeCode!: string;
  @ApiProperty() title!: string;
  @ApiProperty() denominationName!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() taxId!: string;
  @ApiProperty() congregationName!: string;
  @ApiProperty() locationLine!: string;
  @ApiProperty() intro!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() closing!: string;
  @ApiProperty() pastorName!: string;
  @ApiProperty() pastorTitle!: string;
  @ApiProperty({ nullable: true, type: String }) secretaryName!: string | null;
  @ApiProperty() secretaryTitle!: string;
  @ApiProperty() issuedByName!: string;
  @ApiProperty() memberName!: string;
  @ApiProperty() memberCode!: string;
}

export class CertificateListItemDto implements CertificateListItemView {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'CERT-MEM-2026-0031' }) number!: string;
  @ApiProperty() typeCode!: string;
  @ApiProperty() typeName!: string;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty() memberId!: number;
  @ApiProperty() memberName!: string;
  @ApiProperty() memberCode!: string;
  @ApiProperty({ example: '2026-11-02' }) issuedOn!: string;
  @ApiProperty({ nullable: true, type: String, example: '2027-02-02' })
  expiresOn!: string | null;
  @ApiProperty() issuedByName!: string;
  @ApiProperty({ enum: ['ISSUED', 'VOIDED'] }) status!: CertificateStatus;
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
  @ApiProperty({ nullable: true, type: String }) voidedAt!: string | null;
}

export class CertificateDetailDto
  extends CertificateListItemDto
  implements CertificateDetailView
{
  @ApiProperty({ type: CertificateSnapshotDto })
  snapshot!: CertificateSnapshotDto;
}

export class CertificatePreviewDto implements CertificatePreviewView {
  @ApiProperty({ type: CertificateSnapshotDto })
  snapshot!: CertificateSnapshotDto;
  @ApiProperty({ type: [String] }) warnings!: string[];
}

export class CertificatePageDto extends PageResponseDto {
  @ApiProperty({ type: [CertificateListItemDto] })
  items!: CertificateListItemDto[];
}

export class CardListItemDto implements CardListItemView {
  @ApiProperty() id!: number;
  @ApiProperty() memberId!: number;
  @ApiProperty() memberName!: string;
  @ApiProperty({ example: 'SC-0130' }) cardNumber!: string;
  @ApiProperty() congregationId!: number;
  @ApiProperty() congregationName!: string;
  @ApiProperty({ example: '2026-11-02' }) issuedOn!: string;
  @ApiProperty({ example: '2028-11-02' }) expiresOn!: string;
  @ApiProperty({ enum: ['VALID', 'EXPIRED', 'VOIDED'] }) status!: CardStatus;
  @ApiProperty({ nullable: true, type: Number }) daysToExpire!: number | null;
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
}

export class CardPageDto extends PageResponseDto {
  @ApiProperty({ type: [CardListItemDto] }) items!: CardListItemDto[];
}

export class CardCandidateDto {
  @ApiProperty() memberId!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ example: 'SC-0130' }) cardNumber!: string;
  @ApiProperty() hasExpiredCard!: boolean;
}

export class CardCandidatePageDto extends PageResponseDto {
  @ApiProperty({ type: [CardCandidateDto] }) items!: CardCandidateDto[];
}

export class CertificatesSummaryDto implements CertificatesSummaryView {
  @ApiProperty() year!: number;
  @ApiProperty({ example: '2026-11-02' }) today!: string;
  @ApiProperty({ description: 'Certificados del año, anulados incluidos.' })
  issued!: number;
  @ApiProperty() voided!: number;
  @ApiProperty() cardsValid!: number;
  @ApiProperty({
    description: 'Carnés vigentes que vencen en 30 días o menos.',
  })
  cardsExpiringSoon!: number;
  @ApiProperty() cardsExpired!: number;
}
