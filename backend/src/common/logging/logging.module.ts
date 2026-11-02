import { Global, Module } from '@nestjs/common';
import { SmartLogger } from './smart-logger.service.js';

@Global()
@Module({
  providers: [SmartLogger],
  exports: [SmartLogger],
})
export class LoggingModule {}
