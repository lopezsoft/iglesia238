import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from '../application/health.service.js';
import { LivenessResponseDto, ReadinessResponseDto } from './health.dto.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Indica si el proceso está vivo' })
  @ApiResponse({ status: HttpStatus.OK, type: LivenessResponseDto })
  getLiveness(): LivenessResponseDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Indica si las dependencias están disponibles' })
  @ApiResponse({ status: HttpStatus.OK, type: ReadinessResponseDto })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    type: ReadinessResponseDto,
  })
  async getReadiness(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ReadinessResponseDto> {
    const { isReady, checks } = await this.healthService.getReadiness();

    void reply.status(isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: isReady ? 'ok' : 'unavailable', checks };
  }
}
