import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  AI_CHAT_MAX_ASSISTANT_CHARS,
  AI_CHAT_MAX_MESSAGES,
} from '../application/use-cases/ai-chat.use-case.js';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({
    description:
      'Activa o desactiva el chat de la aplicación. Para activarlo la sede debe tener una clave guardada.',
  })
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Acepta o no conexiones MCP externas con los tokens de la sede.',
  })
  @IsOptional()
  @IsBoolean()
  mcpEnabled?: boolean;

  @ApiPropertyOptional({ example: 'claude-sonnet-5-5' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  model?: string;
}

export class SaveAiKeyDto {
  @ApiProperty({
    description:
      'Clave de API de Anthropic de la sede (empieza con sk-ant-). Se comprueba con Anthropic, se guarda cifrada y no se vuelve a mostrar.',
  })
  @IsString()
  @MinLength(20, { message: 'Pega la clave completa.' })
  @MaxLength(400, { message: 'La clave es demasiado larga.' })
  apiKey!: string;
}

export class CreateAiTokenDto {
  @ApiProperty({ example: 'Claude del pastor', maxLength: 80 })
  @IsString()
  @MinLength(1, { message: 'Ponle un nombre a la conexión.' })
  @MaxLength(80, { message: 'El nombre admite hasta 80 caracteres.' })
  name!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 365,
    description: 'Días hasta que deja de servir; sin valor no vence.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

export class AiChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({
    maxLength: AI_CHAT_MAX_ASSISTANT_CHARS,
    description:
      'Hasta 4000 caracteres en un mensaje del usuario y hasta 20000 en una respuesta del asistente (la regla por rol la aplica el caso de uso).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(AI_CHAT_MAX_ASSISTANT_CHARS, {
    message: `Cada mensaje admite hasta ${AI_CHAT_MAX_ASSISTANT_CHARS} caracteres.`,
  })
  content!: string;
}

export class AiChatDto {
  @ApiProperty({
    type: [AiChatMessageDto],
    description:
      'La conversación completa, del más antiguo al más reciente; el último mensaje es del usuario.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AI_CHAT_MAX_MESSAGES)
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  messages!: AiChatMessageDto[];
}
