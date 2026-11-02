import { ApiProperty } from '@nestjs/swagger';
import type { DependencyStatus } from '../application/health.service.js';

export class LivenessResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;
}

export class ReadinessResponseDto {
  @ApiProperty({ enum: ['ok', 'unavailable'] })
  status!: 'ok' | 'unavailable';

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['up', 'down'] },
    example: { database: 'up', redis: 'up' },
  })
  checks!: Record<string, DependencyStatus>;
}
