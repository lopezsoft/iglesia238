import {
  Controller,
  Get,
  HttpStatus,
  Param,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Res } from '@nestjs/common';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { Public } from '../../../common/security/public.decorator.js';
import { ReadLogoFileUseCase } from '../application/use-cases/branding.use-cases.js';

/** The logo of a denomination, for the web app (<img>) and anyone who opens a certificate. Not sensitive. */
@Public()
@ApiTags('public')
@Controller('public/branding')
export class PublicBrandingController {
  constructor(private readonly readLogo: ReadLogoFileUseCase) {}

  @Get(':denominationId/:fileName')
  @RateLimit({ name: 'public-branding', limit: 240, windowSeconds: 60 })
  @ApiOperation({
    summary: 'Archivo de un logo de la denominación',
    description:
      'El nombre del archivo lleva el hash de su contenido, así que nunca cambia: se cachea por un año. Sirve también los logos anteriores, porque los certificados ya expedidos los usan.',
  })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiResponse({ status: HttpStatus.OK, description: 'La imagen.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No existe.' })
  async file(
    @Param('denominationId', PositiveIntPipe) denominationId: number,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.readLogo.execute(denominationId, fileName);
    void reply
      .header('Content-Type', file.mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      // The file is a picture and nothing else: a browser that opens it directly runs nothing from it.
      .header('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(file.content);
  }
}
