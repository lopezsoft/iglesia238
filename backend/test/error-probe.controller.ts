import {
  Controller,
  Get,
  InternalServerErrorException,
  Module,
} from '@nestjs/common';
import { Prisma } from '../src/generated/prisma/client.js';

/** Test-only routes that throw the errors the global filter must translate. */
@Controller('test-errors')
class ErrorProbeController {
  @Get('duplicate')
  duplicate(): never {
    throw new Prisma.PrismaClientKnownRequestError('Unique failed on email', {
      code: 'P2002',
      clientVersion: 'test',
    });
  }

  @Get('missing')
  missing(): never {
    throw new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
  }

  @Get('server-error')
  serverError(): never {
    throw new InternalServerErrorException('internal detail');
  }
}

@Module({ controllers: [ErrorProbeController] })
export class ErrorProbeModule {}
