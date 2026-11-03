import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { CreateDenominationUseCase } from './application/create-denomination.use-case.js';
import {
  DENOMINATION_PROVISIONER,
  DENOMINATION_REPOSITORY,
} from './application/denomination.repository.port.js';
import {
  GetDenominationStatsUseCase,
  ListDenominationsUseCase,
} from './application/list-denominations.use-case.js';
import {
  RenameDenominationUseCase,
  SetDenominationStatusUseCase,
} from './application/update-denomination.use-case.js';
import { PrismaDenominationProvisioner } from './infrastructure/prisma-denomination.provisioner.js';
import { PrismaDenominationRepository } from './infrastructure/prisma-denomination.repository.js';
import { DenominationsController } from './presentation/denominations.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [DenominationsController],
  providers: [
    ListDenominationsUseCase,
    GetDenominationStatsUseCase,
    CreateDenominationUseCase,
    RenameDenominationUseCase,
    SetDenominationStatusUseCase,
    {
      provide: DENOMINATION_REPOSITORY,
      useClass: PrismaDenominationRepository,
    },
    {
      provide: DENOMINATION_PROVISIONER,
      useClass: PrismaDenominationProvisioner,
    },
  ],
})
export class DenominationsModule {}
