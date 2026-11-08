import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import type { CertificateVerificationView } from '../application/certificate.models.js';

export class VerifyCertificateQueryDto {
  @ApiProperty({
    description:
      'Token firmado del código QR del certificado (parámetro t del enlace).',
    example: '123.AbCdEfGhIjKlMnOpQrStUv',
  })
  @IsString()
  @Matches(/^\d{1,10}\.[A-Za-z0-9_-]{22}$/, {
    message: 'El código de verificación no es válido.',
  })
  token!: string;
}

export class CertificateVerificationDto implements CertificateVerificationView {
  @ApiProperty({ enum: ['VALID', 'EXPIRED', 'VOIDED'] })
  status!: 'VALID' | 'EXPIRED' | 'VOIDED';
  @ApiProperty({ example: 'CERT-MEM-2026-0031' }) number!: string;
  @ApiProperty({ example: 'CERTIFICADO DE MEMBRESÍA' }) title!: string;
  @ApiProperty() denominationName!: string;
  @ApiProperty() congregationName!: string;
  @ApiProperty({
    example: 'Ana M. R. D.',
    description: 'Titular enmascarado: nombre y iniciales de los apellidos.',
  })
  holderName!: string;
  @ApiProperty({ example: '2026-11-02' }) issuedOn!: string;
  @ApiProperty({ nullable: true, type: String, example: '2027-02-02' })
  expiresOn!: string | null;
  @ApiProperty({ example: '2026-11-08' }) verifiedOn!: string;
}
