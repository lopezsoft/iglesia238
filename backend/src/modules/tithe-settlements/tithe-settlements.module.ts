import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { ConfirmTitheSettlementUseCase } from './application/confirm-tithe-settlement.use-case.js';
import { GetTitheOverviewUseCase } from './application/get-tithe-overview.use-case.js';
import {
  GetTitheSettlementUseCase,
  ListTitheSettlementsUseCase,
} from './application/list-tithe-settlements.use-case.js';
import { PreviewTitheSettlementUseCase } from './application/preview-tithe-settlement.use-case.js';
import { TitheDraftService } from './application/tithe-draft.service.js';
import { TitheSettlementWidgets } from './application/tithe-settlement.widgets.js';
import {
  TITHE_RULE_READER,
  TITHE_SETTLEMENT_READER,
  TITHE_SETTLEMENT_WRITER,
} from './application/tithe-settlement.ports.js';
import { VoidTitheSettlementUseCase } from './application/void-tithe-settlement.use-case.js';
import { PrismaTitheRuleReader } from './infrastructure/prisma-tithe-rule.reader.js';
import { PrismaTitheSettlementReader } from './infrastructure/prisma-tithe-settlement.reader.js';
import { PrismaTitheSettlementWriter } from './infrastructure/prisma-tithe-settlement.writer.js';
import { TitheSettlementsController } from './presentation/tithe-settlements.controller.js';

/** E-05 Liquidación del diezmo. Cross-cutting services (audit, numbering, clock) come from FoundationModule. */
@Module({
  imports: [PrismaModule],
  controllers: [TitheSettlementsController],
  providers: [
    TitheDraftService,
    GetTitheOverviewUseCase,
    PreviewTitheSettlementUseCase,
    ConfirmTitheSettlementUseCase,
    VoidTitheSettlementUseCase,
    ListTitheSettlementsUseCase,
    GetTitheSettlementUseCase,
    TitheSettlementWidgets,
    { provide: TITHE_SETTLEMENT_READER, useClass: PrismaTitheSettlementReader },
    { provide: TITHE_SETTLEMENT_WRITER, useClass: PrismaTitheSettlementWriter },
    { provide: TITHE_RULE_READER, useClass: PrismaTitheRuleReader },
  ],
})
export class TitheSettlementsModule {}
