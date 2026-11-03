import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { CongregationsPanelComponent } from './components/congregations-panel.component';
import { DistrictsPanelComponent } from './components/districts-panel.component';
import { LegalEntitiesPanelComponent } from './components/legal-entities-panel.component';
import { ORGANIZATION_TABS, OrganizationTab, isOrganizationTab } from './data/organization.models';
import { OrganizationRepository } from './data/organization.repository';

const CREATE_LABELS: Readonly<Record<OrganizationTab, string>> = {
  sedes: 'Nueva sede',
  razones: 'Nueva razón social',
  distritos: 'Nuevo distrito',
};

/** B-02/B-03: sedes, legal entities and districts of the tenant denomination. */
@Component({
  selector: 'app-organization-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CongregationsPanelComponent,
    DistrictsPanelComponent,
    IconComponent,
    LegalEntitiesPanelComponent,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    SectionPanelComponent,
    StatCardComponent,
    TabCardsComponent,
  ],
  templateUrl: './organization.page.html',
  styleUrl: './organization.page.scss',
})
export class OrganizationPage {
  private readonly repository = inject(OrganizationRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** `?tab=` query param, bound by the router. */
  readonly tab = input<string>();

  protected readonly tabs: readonly TabCardItem[] = ORGANIZATION_TABS.map((tab) => ({
    id: tab.value,
    title: tab.label,
    subtitle: tab.subtitle,
    icon: tab.icon,
  }));
  protected readonly activeTab = computed<OrganizationTab>(() => {
    const tab = this.tab();
    return isOrganizationTab(tab) ? tab : 'sedes';
  });
  protected readonly createLabel = computed(() => CREATE_LABELS[this.activeTab()]);
  protected readonly canManage = computed(() => this.auth.can('congregations.manage'));

  protected readonly overview = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.overview(),
  });
  /** The overview, or null while loading or after an error (`value()` throws in that state). */
  protected readonly summary = computed(() =>
    this.overview.hasValue() ? this.overview.value() : null,
  );
  protected readonly denominationName = computed(() => this.summary()?.denominationName ?? '');
  protected readonly description = computed(() => {
    const name = this.denominationName();
    return name
      ? `Estructura de ${name}: sedes, entidades legales y distritos.`
      : 'Estructura de la denominación: sedes, entidades legales y distritos.';
  });
  protected readonly acceptingLabel = computed(() => {
    const overview = this.summary();
    return overview ? `${overview.acceptingApplications} de ${overview.totalCongregations}` : '—';
  });
  protected readonly notice = signal<string | null>(null);

  private readonly congregationsPanel = viewChild(CongregationsPanelComponent);
  private readonly legalEntitiesPanel = viewChild(LegalEntitiesPanelComponent);
  private readonly districtsPanel = viewChild(DistrictsPanelComponent);

  protected tabId(tab: string): string {
    return `organization-tab-${tab}`;
  }

  protected selectTab(value: string): void {
    const tab = isOrganizationTab(value) ? value : 'sedes';
    this.notice.set(null);
    void this.router.navigate([], {
      queryParams: { tab: tab === 'sedes' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected openCreate(): void {
    switch (this.activeTab()) {
      case 'sedes':
        this.congregationsPanel()?.openCreate();
        break;
      case 'razones':
        this.legalEntitiesPanel()?.openCreate();
        break;
      case 'distritos':
        this.districtsPanel()?.openCreate();
        break;
    }
  }

  protected onChanged(message: string): void {
    this.notice.set(message);
    this.overview.reload();
    // A sede created, renamed or deactivated changes the sedes the administrator can act on.
    void this.auth.refreshSession();
  }
}
