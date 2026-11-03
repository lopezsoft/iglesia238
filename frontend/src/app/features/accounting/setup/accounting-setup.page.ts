import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent, ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { MiniStatComponent } from '../../../shared/ui/mini-stat.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { yearMonthOf } from '../../../shared/utils/period';
import { AccountFormDialogComponent } from './components/account-form-dialog.component';
import { AccountsTreeComponent } from './components/accounts-tree.component';
import { ContributionTypeFormDialogComponent } from './components/contribution-type-form-dialog.component';
import { ContributionTypesTableComponent } from './components/contribution-types-table.component';
import { FundFormDialogComponent } from './components/fund-form-dialog.component';
import { FundsPanelComponent } from './components/funds-panel.component';
import { OpenPeriodDialogComponent } from './components/open-period-dialog.component';
import { PeriodsPanelComponent } from './components/periods-panel.component';
import { TitheRuleFormDialogComponent } from './components/tithe-rule-form-dialog.component';
import { TitheRulesPanelComponent } from './components/tithe-rules-panel.component';
import { AccountRow, ContributionTypeRow, FundRow, PeriodRow, TitheRuleRow } from './data/accounting-setup.models';
import { AccountingSetupRepository } from './data/accounting-setup.repository';
import { formatRate } from './data/tithe-rate';

type SetupTab = 'funds' | 'accounts' | 'types' | 'periods' | 'tithe';

const TAB_IDS: readonly SetupTab[] = ['funds', 'accounts', 'types', 'periods', 'tithe'];

interface PendingDelete {
  readonly kind: 'fund' | 'account' | 'tithe';
  readonly id: number;
  readonly label: string;
}

interface Todo {
  readonly tab: SetupTab;
  readonly message: string;
}

/** E-01 Configuración contable: funds, chart of accounts, contribution types, periods and tithe percentages. */
@Component({
  selector: 'app-accounting-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountFormDialogComponent,
    AccountsTreeComponent,
    ContributionTypeFormDialogComponent,
    ContributionTypesTableComponent,
    DialogComponent,
    ErrorBannerComponent,
    FundFormDialogComponent,
    FundsPanelComponent,
    IconComponent,
    LoadingComponent,
    MiniStatComponent,
    MoneyPipe,
    OpenPeriodDialogComponent,
    PageHeaderComponent,
    PeriodsPanelComponent,
    ReadOnlyNoticeComponent,
    SectionPanelComponent,
    TabCardsComponent,
    TitheRuleFormDialogComponent,
    TitheRulesPanelComponent,
  ],
  templateUrl: './accounting-setup.page.html',
  styleUrl: './accounting-setup.page.scss',
})
export class AccountingSetupPage {
  private readonly repository = inject(AccountingSetupRepository);
  private readonly auth = inject(AuthService);

  protected readonly canManage = computed(() => this.auth.can('budgets.manage'));
  /** Opening a period also belongs to the treasurer who keeps the cash book. */
  protected readonly canOpenPeriod = computed(() => this.auth.can('budgets.manage') || this.auth.can('cash-transactions.write'));
  protected readonly tab = signal<SetupTab>('funds');
  protected readonly formatRate = formatRate;

  protected readonly overview = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.overview(),
  });
  protected readonly funds = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listFunds(),
  });
  protected readonly accounts = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listAccounts(),
  });
  protected readonly types = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listContributionTypes(),
  });
  protected readonly periods = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listPeriods(),
  });
  protected readonly titheRules = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listTitheRules(),
  });

  /** `value()` throws while a resource is in error, so everything else reads this. */
  protected readonly overviewData = computed(() => (this.overview.hasValue() ? this.overview.value() : undefined));
  protected readonly fundsData = computed(() => (this.funds.hasValue() ? this.funds.value() : undefined));
  protected readonly accountsData = computed(() => (this.accounts.hasValue() ? this.accounts.value() : undefined));
  protected readonly typesData = computed(() => (this.types.hasValue() ? this.types.value() : undefined));
  protected readonly periodsData = computed(() => (this.periods.hasValue() ? this.periods.value() : undefined));
  protected readonly titheRulesData = computed(() => (this.titheRules.hasValue() ? this.titheRules.value() : undefined));

  protected readonly tabs = computed<readonly TabCardItem[]>(() => [
    { id: 'funds', title: 'Fondos', subtitle: this.countLabel(this.fundsData()?.length), icon: 'wallet' },
    { id: 'accounts', title: 'Plan de cuentas', subtitle: this.countLabel(this.accountsData()?.length), icon: 'book' },
    { id: 'types', title: 'Tipos de aporte', subtitle: this.countLabel(this.typesData()?.length), icon: 'coins' },
    { id: 'periods', title: 'Periodos', subtitle: this.countLabel(this.periodsData()?.length), icon: 'calendar-check' },
    { id: 'tithe', title: 'Diezmo', subtitle: 'Porcentajes de liquidación', icon: 'percent' },
  ]);

  /** What is still missing for the sede to start operating. */
  protected readonly todos = computed<readonly Todo[]>(() => {
    const info = this.overviewData();
    if (!info) {
      return [];
    }
    const list: Todo[] = [];
    if (info.congregationScoped && info.currentPeriod === null) {
      list.push({
        tab: 'periods',
        message: `${info.scopeLabel} no tiene abierto el periodo del mes en curso: sin él no se pueden registrar aportes ni movimientos de caja.`,
      });
    }
    if (info.titheRule === null) {
      list.push({
        tab: 'tithe',
        message: 'Falta definir los porcentajes de liquidación del diezmo de la denominación.',
      });
    }
    if (info.activeFunds === 0) {
      list.push({ tab: 'funds', message: 'Crea al menos un fondo activo para consolidar los aportes en el libro de caja.' });
    }
    return list;
  });

  protected readonly titheSummary = computed(() => {
    const rule = this.overviewData()?.titheRule;
    return rule ? `${formatRate(rule.nationalShareRate)} + ${formatRate(rule.localFundRate)}` : 'Sin definir';
  });
  protected readonly currentMonth = computed(() => yearMonthOf(this.overviewData()?.today ?? '2000-01-01').month);

  protected readonly flash = signal<string | null>(null);
  protected readonly typeBusyId = signal<number | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly fundDialogOpen = signal(false);
  protected readonly editingFund = signal<FundRow | null>(null);
  protected readonly accountDialogOpen = signal(false);
  protected readonly editingAccount = signal<AccountRow | null>(null);
  protected readonly accountParentId = signal<number | null>(null);
  protected readonly typeDialogOpen = signal(false);
  protected readonly editingType = signal<ContributionTypeRow | null>(null);
  protected readonly periodDialogOpen = signal(false);
  protected readonly ruleDialogOpen = signal(false);
  protected readonly editingRule = signal<TitheRuleRow | null>(null);
  protected readonly pendingDelete = signal<PendingDelete | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);

  protected selectTab(id: string): void {
    const tab = TAB_IDS.find((candidate) => candidate === id);
    if (tab) {
      this.tab.set(tab);
    }
  }

  /** The button of the page header creates whatever the open tab lists. */
  protected openCreate(): void {
    this.flash.set(null);
    switch (this.tab()) {
      case 'funds':
        this.editFund(null);
        break;
      case 'accounts':
        this.editAccount(null, null);
        break;
      case 'types':
        this.editType(null);
        break;
      case 'periods':
        this.periodDialogOpen.set(true);
        break;
      case 'tithe':
        this.editRule(null);
        break;
    }
  }

  protected readonly createLabel = computed(() => {
    switch (this.tab()) {
      case 'funds':
        return 'Nuevo fondo';
      case 'accounts':
        return 'Nueva cuenta';
      case 'types':
        return 'Nuevo tipo de aporte';
      case 'periods':
        return this.periodsData()?.length === 0 ? 'Abrir el primer periodo' : 'Abrir periodo';
      case 'tithe':
        return 'Nuevo porcentaje';
    }
  });

  protected readonly canCreate = computed(() => (this.tab() === 'periods' ? this.canOpenPeriod() : this.canManage()));

  protected editFund(fund: FundRow | null): void {
    this.editingFund.set(fund);
    this.fundDialogOpen.set(true);
  }

  protected editAccount(account: AccountRow | null, parentId: number | null): void {
    this.editingAccount.set(account);
    this.accountParentId.set(parentId);
    this.accountDialogOpen.set(true);
  }

  protected editType(type: ContributionTypeRow | null): void {
    this.editingType.set(type);
    this.typeDialogOpen.set(true);
  }

  protected editRule(rule: TitheRuleRow | null): void {
    this.editingRule.set(rule);
    this.ruleDialogOpen.set(true);
  }

  protected onFundSaved(fund: FundRow): void {
    this.flash.set(`Fondo «${fund.name}» guardado.`);
    this.funds.reload();
    this.overview.reload();
    this.accounts.reload();
  }

  protected onAccountSaved(account: AccountRow): void {
    this.flash.set(`Cuenta ${account.code} guardada.`);
    this.accounts.reload();
  }

  protected onTypeSaved(type: ContributionTypeRow): void {
    this.flash.set(`Tipo de aporte «${type.name}» guardado.`);
    this.types.reload();
    this.accounts.reload();
  }

  protected onPeriodOpened(period: PeriodRow): void {
    this.flash.set(`${period.label} quedó abierto: ya se pueden registrar aportes y movimientos de caja en él.`);
    this.periods.reload();
    this.overview.reload();
  }

  protected onRuleSaved(rule: TitheRuleRow): void {
    this.flash.set(`Porcentaje del diezmo desde ${rule.effectiveFrom} guardado.`);
    this.titheRules.reload();
    this.overview.reload();
  }

  protected async toggleType(type: ContributionTypeRow): Promise<void> {
    this.typeBusyId.set(type.id);
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(this.repository.setContributionTypeActive(type.id, !type.isActive));
      this.flash.set(`Tipo «${updated.name}» ${updated.isActive ? 'activado' : 'desactivado'}.`);
      this.types.reload();
      this.accounts.reload();
    } catch (error) {
      this.actionError.set(userMessage(error));
    } finally {
      this.typeBusyId.set(null);
    }
  }

  protected async toggleAccount(account: AccountRow): Promise<void> {
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(this.repository.setAccountActive(account.id, !account.isActive));
      this.flash.set(`Cuenta ${updated.code} ${updated.isActive ? 'activada' : 'desactivada'}.`);
      this.accounts.reload();
    } catch (error) {
      this.actionError.set(userMessage(error));
    }
  }

  protected askDelete(kind: PendingDelete['kind'], id: number, label: string): void {
    this.actionError.set(null);
    this.pendingDelete.set({ kind, id, label });
    this.deleteOpen.set(true);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.pendingDelete();
    if (!target || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.actionError.set(null);
    const command: Observable<void> =
      target.kind === 'fund'
        ? this.repository.deleteFund(target.id)
        : target.kind === 'account'
          ? this.repository.deleteAccount(target.id)
          : this.repository.deleteTitheRule(target.id);
    try {
      await firstValueFrom(command, { defaultValue: undefined });
      this.flash.set(`${target.label} eliminado.`);
      this.deleteOpen.set(false);
      switch (target.kind) {
        case 'fund':
          this.funds.reload();
          this.overview.reload();
          break;
        case 'account':
          this.accounts.reload();
          break;
        case 'tithe':
          this.titheRules.reload();
          this.overview.reload();
          break;
      }
    } catch (error) {
      this.actionError.set(userMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }

  private countLabel(count: number | undefined): string | undefined {
    return count === undefined ? undefined : `${count} ${count === 1 ? 'registro' : 'registros'}`;
  }
}
