import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { Public } from '../../../common/security/public.decorator.js';
import { VerifyCertificateUseCase } from '../application/use-cases/verify-certificate.use-case.js';
import {
  CertificateVerificationDto,
  VerifyCertificateQueryDto,
} from './certificate-verification.dto.js';

/** Anonymous verification of a certificate from the QR code printed on it. Throttled per client IP. */
@Public()
@ApiTags('public')
@Controller('public/certificates')
export class PublicCertificatesController {
  constructor(private readonly verifyCertificate: VerifyCertificateUseCase) {}

  @Get('verify')
  @RateLimit({
    name: 'public-certificate-verify',
    limit: 30,
    windowSeconds: 60,
  })
  @ApiOperation({
    summary: 'Verificar la autenticidad de un certificado',
    description:
      'Recibe el token firmado del código QR del certificado. Responde si el documento está vigente, vencido o anulado, con los datos que ya imprime (titular enmascarado). Un token inválido y un documento inexistente responden igual (404).',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CertificateVerificationDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Código inválido o documento inexistente.',
  })
  verify(
    @Query() query: VerifyCertificateQueryDto,
  ): Promise<CertificateVerificationDto> {
    return this.verifyCertificate.execute(query.token);
  }
}
