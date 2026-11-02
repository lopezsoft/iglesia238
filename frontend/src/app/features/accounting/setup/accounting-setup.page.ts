import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { DialogComponent } from '../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent, ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { AccountFormDialogComponent } from './components/account-form-dialog.component';
import { AccountsTreeComponent } from './components/accounts-tree.component';
import { ContributionTypeFormDialogComponent } from './components/contribution-type-form-dialog.component';
import { ContributionTypesTableComponent } from './components/contribution-types-table.component';
import { FundFormDialogComponent } from './components/fund-form-dialog.component';
import { FundsPanelComponent } from './components/funds-panel.component';
import { AccountRow, ContributionTypeRow, FundRow } from './data/accounting-setup.models';
import { AccountingSetupRepository } from './data/accounting-setup.repository';

type SetupTab = 'funds' | 'accounts' | 'types';

interface PendingDelete {
  readonly kind: 'fund' | 'account';
  readonly id: number;
  readonly label: string;
}

/** E-01 Configuración contable: funds, chart of accounts and contribution types. */
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
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
  ],
  templateUrl: './accounting-setup.page.html',
  styleUrl: './accounting-setup.page.scss',
})
export class AccountingSetupPage {
  private readonly repository = inject(AccountingSetupRepository);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  protected readonly canManage = computed(() => this.auth.can('budgets.manage'));
  protected readonly tab = signal<SetupTab>('funds');

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

  protected readonly tabs = computed(() => [
    { id: 'funds' as const, label: 'Fondos', count: this.funds.value()?.length },
    { id: 'accounts' as const, label: 'Plan de cuentas', count: this.accounts.value()?.length },
    { id: 'types' as const, label: 'Tipos de aporte', count: this.types.value()?.length },
  ]);

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
  protected readonly pendingDelete = signal<PendingDelete | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);

  protected selectTab(tab: SetupTab): void {
    this.tab.set(tab);
  }

  /** Arrow keys move between tabs, as in the WAI-ARIA tabs pattern. */
  protected onTabKey(event: KeyboardEvent, index: number): void {
    const ids: SetupTab[] = ['funds', 'accounts', 'types'];
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta !== 0) {
      const next = ids[(index + delta + ids.length) % ids.length];
      this.tab.set(next);
      this.document.getElementById(`tab-${next}`)?.focus();
    }
  }

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
    }
  }

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

  protected async toggleType(type: ContributionTypeRow): Promise<void> {
    this.typeBusyId.set(type.id);
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(this.repository.setContributionTypeActive(type.id, !type.isActive));
      this.flash.set(`Tipo «${updated.name}» ${updated.isActive ? 'activado' : 'desactivado'}.`);
      this.types.reload();
    } catch (error) {
      this.actionError.set(userMessage(error));
    } finally {
      this.typeBusyId.set(null);
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
      target.kind === 'fund' ? this.repository.deleteFund(target.id) : this.repository.deleteAccount(target.id);
    try {
      await firstValueFrom(command, { defaultValue: undefined });
      this.flash.set(`${target.label} eliminado.`);
      this.deleteOpen.set(false);
      if (target.kind === 'fund') {
        this.funds.reload();
        this.overview.reload();
      } else {
        this.accounts.reload();
      }
    } catch (error) {
      this.actionError.set(userMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }
}
