import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { ExportContributionsDetailUseCase } from './application/export-contributions-detail.use-case.js';
import { GetFinancialReportUseCase } from './application/get-financial-report.use-case.js';
import { GetReportOptionsUseCase } from './application/get-report-options.use-case.js';
import { FINANCIAL_DATA_READER } from './application/ports/financial-data.reader.js';
import { ReportScopeResolver } from './application/report-scope.resolver.js';
import { CashBalanceWidgets } from './application/widgets/cash-balance.widgets.js';
import { IncomeWidgets } from './application/widgets/income.widgets.js';
import { PrismaFinancialDataReader } from './infrastructure/prisma-financial-data.reader.js';
import { ReportsController } from './presentation/reports.controller.js';

/**
 * E-07 Reportes financieros, read-only over the accounting context. It also puts the finance widgets
 * (contributions hero, cash income and expense, fund balances) on the dashboard.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [
    ReportScopeResolver,
    GetReportOptionsUseCase,
    GetFinancialReportUseCase,
    ExportContributionsDetailUseCase,
    IncomeWidgets,
    CashBalanceWidgets,
    { provide: FINANCIAL_DATA_READER, useClass: PrismaFinancialDataReader },
  ],
})
export class ReportsModule {}
