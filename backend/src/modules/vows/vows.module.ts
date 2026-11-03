import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { CancelVowPledgeUseCase } from './application/cancel-vow-pledge.use-case.js';
import { CreateVowPledgeUseCase } from './application/create-vow-pledge.use-case.js';
import { ExportVowPledgesUseCase } from './application/export-vow-pledges.use-case.js';
import { GetVowPledgeUseCase } from './application/get-vow-pledge.use-case.js';
import { ListVowPledgesUseCase } from './application/list-vow-pledges.use-case.js';
import { UpdateVowPledgeUseCase } from './application/update-vow-pledge.use-case.js';
import {
  GetVowPaymentTargetUseCase,
  ListOpenVowPledgesUseCase,
} from './application/vow-payment-targets.use-cases.js';
import { VOWS_REPOSITORY } from './application/vows.repository.js';
import { PrismaVowPledgeLedger } from './infrastructure/prisma-vow-pledge-ledger.js';
import { PrismaVowsRepository } from './infrastructure/prisma-vows.repository.js';
import { VowPledgesController } from './presentation/vows.controller.js';

/** Votos: promesas, saldo y avance. Exporta el libro de promesas que Aportes usa para validar los abonos. */
@Module({
  imports: [PrismaModule],
  controllers: [VowPledgesController],
  providers: [
    PrismaVowPledgeLedger,
    PrismaVowsRepository,
    { provide: VOWS_REPOSITORY, useExisting: PrismaVowsRepository },
    ListVowPledgesUseCase,
    GetVowPledgeUseCase,
    ExportVowPledgesUseCase,
    CreateVowPledgeUseCase,
    UpdateVowPledgeUseCase,
    CancelVowPledgeUseCase,
    ListOpenVowPledgesUseCase,
    GetVowPaymentTargetUseCase,
  ],
  exports: [PrismaVowPledgeLedger],
})
export class VowsModule {}
