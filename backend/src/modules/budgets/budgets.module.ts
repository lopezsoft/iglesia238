import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { BUDGET_READER, BUDGET_WRITER } from './application/budget.ports.js';
import { DeleteBudgetLineUseCase } from './application/delete-budget-line.use-case.js';
import { GetBudgetLineDetailUseCase } from './application/get-budget-line-detail.use-case.js';
import { GetBudgetOverviewUseCase } from './application/get-budget-overview.use-case.js';
import {
  ChangeBudgetStatusUseCase,
  CopyBudgetUseCase,
  UpdateBudgetIncomeRateUseCase,
} from './application/manage-budget.use-cases.js';
import { SaveBudgetLineUseCase } from './application/save-budget-line.use-case.js';
import { PrismaBudgetReader } from './infrastructure/prisma-budget.reader.js';
import { PrismaBudgetWriter } from './infrastructure/prisma-budget.writer.js';
import { BudgetsController } from './presentation/budgets.controller.js';

/** E-06 Presupuesto. Cross-cutting services (audit, transactions, clock) come from FoundationModule. */
@Module({
  imports: [PrismaModule],
  controllers: [BudgetsController],
  providers: [
    GetBudgetOverviewUseCase,
    SaveBudgetLineUseCase,
    DeleteBudgetLineUseCase,
    GetBudgetLineDetailUseCase,
    ChangeBudgetStatusUseCase,
    UpdateBudgetIncomeRateUseCase,
    CopyBudgetUseCase,
    { provide: BUDGET_READER, useClass: PrismaBudgetReader },
    { provide: BUDGET_WRITER, useClass: PrismaBudgetWriter },
  ],
})
export class BudgetsModule {}
