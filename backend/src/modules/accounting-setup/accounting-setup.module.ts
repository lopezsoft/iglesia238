import { Module } from '@nestjs/common';
import { CONGREGATION_LOOKUP } from '../../common/accounting/congregation-lookup.port.js';
import { PrismaCongregationLookup } from '../../infrastructure/prisma/prisma-congregation-lookup.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { ACCOUNT_REPOSITORY } from './application/account.repository.js';
import { AccountingPeriodsService } from './application/accounting-periods.service.js';
import { AccountsService } from './application/accounts.service.js';
import { CONTRIBUTION_TYPE_REPOSITORY } from './application/contribution-type.repository.js';
import { ContributionTypesService } from './application/contribution-types.service.js';
import { FUND_REPOSITORY } from './application/fund.repository.js';
import { FundsService } from './application/funds.service.js';
import { PERIOD_REPOSITORY } from './application/period.repository.js';
import { SetupOverviewService } from './application/setup-overview.service.js';
import { TITHE_RULE_REPOSITORY } from './application/tithe-rule.repository.js';
import { TitheRulesService } from './application/tithe-rules.service.js';
import { PrismaAccountRepository } from './infrastructure/prisma-account.repository.js';
import { PrismaContributionTypeRepository } from './infrastructure/prisma-contribution-type.repository.js';
import { PrismaFundRepository } from './infrastructure/prisma-fund.repository.js';
import { PrismaPeriodRepository } from './infrastructure/prisma-period.repository.js';
import { PrismaTitheRuleRepository } from './infrastructure/prisma-tithe-rule.repository.js';
import {
  AccountingPeriodsController,
  AccountsController,
  ContributionTypesController,
  FundsController,
  SetupOverviewController,
  TitheRulesController,
} from './presentation/setup.controllers.js';

/**
 * Accounting setup: funds and opening balances, chart of accounts, contribution types, accounting
 * periods and the tithe settlement percentages.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    SetupOverviewController,
    FundsController,
    AccountsController,
    ContributionTypesController,
    AccountingPeriodsController,
    TitheRulesController,
  ],
  providers: [
    FundsService,
    AccountsService,
    ContributionTypesService,
    AccountingPeriodsService,
    TitheRulesService,
    SetupOverviewService,
    { provide: FUND_REPOSITORY, useClass: PrismaFundRepository },
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    {
      provide: CONTRIBUTION_TYPE_REPOSITORY,
      useClass: PrismaContributionTypeRepository,
    },
    { provide: PERIOD_REPOSITORY, useClass: PrismaPeriodRepository },
    { provide: TITHE_RULE_REPOSITORY, useClass: PrismaTitheRuleRepository },
    { provide: CONGREGATION_LOOKUP, useClass: PrismaCongregationLookup },
  ],
})
export class AccountingSetupModule {}
