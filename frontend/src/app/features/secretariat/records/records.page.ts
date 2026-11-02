import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { ErrorBannerComponent, LoadingComponent, ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { DedicationDialogComponent } from './components/dedication-dialog.component';
import { DedicationsPanelComponent } from './components/dedications-panel.component';
import { DissolutionDialogComponent } from './components/dissolution-dialog.component';
import { MarriageDialogComponent } from './components/marriage-dialog.component';
import { MarriagesPanelComponent } from './components/marriages-panel.component';
import { PastoralTermDialogComponent } from './components/pastoral-term-dialog.component';
import { PastoralTermsPanelComponent } from './components/pastoral-terms-panel.component';
import { Marriage, isActiveMarriage, todayIso } from './data/records.models';
import { RecordsRepository } from './data/records.repository';

type RecordsTab = 'dedications' | 'marriages' | 'pastoral';

interface TabDefinition {
  readonly key: RecordsTab;
  readonly label: string;
  readonly newLabel: string;
}

const TABS: readonly TabDefinition[] = [
  { key: 'dedications', label: 'Presentación de niños', newLabel: 'Nueva presentación' },
  { key: 'marriages', label: 'Matrimonios', newLabel: 'Nuevo matrimonio' },
  { key: 'pastoral', label: 'Periodos pastorales', newLabel: 'Nuevo periodo' },
];

/** D-04 and D-05: presentations of children, marriages and pastoral terms of the active scope. */
@Component({
  selector: 'app-records-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    StatCardComponent,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
    ReadOnlyNoticeComponent,
    DedicationsPanelComponent,
    MarriagesPanelComponent,
    PastoralTermsPanelComponent,
    DedicationDialogComponent,
    MarriageDialogComponent,
    DissolutionDialogComponent,
    PastoralTermDialogComponent,
  ],
  templateUrl: './records.page.html',
  styleUrl: './records.page.scss',
})
export class RecordsPage {
  private readonly repository = inject(RecordsRepository);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly tabs = TABS;
  protected readonly tab = signal<RecordsTab>('dedications');
  protected readonly activeTab = computed(() => TABS.find((tab) => tab.key === this.tab()) ?? TABS[0]);
  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  protected readonly toast = signal<string | null>(null);

  protected readonly dedicationOpen = signal(false);
  protected readonly marriageOpen = signal(false);
  protected readonly termOpen = signal(false);
  protected readonly dissolutionOpen = signal(false);
  protected readonly dissolving = signal<Marriage | null>(null);

  protected readonly context = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.context(),
  });
  protected readonly dedications = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.dedications(),
  });
  protected readonly marriages = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.marriages(),
  });
  protected readonly terms = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.pastoralTerms(),
  });

  private readonly dedicationRows = computed(() => (this.dedications.hasValue() ? this.dedications.value() : []));
  private readonly marriageRows = computed(() => (this.marriages.hasValue() ? this.marriages.value() : []));
  protected readonly termRows = computed(() => (this.terms.hasValue() ? this.terms.value() : []));

  protected readonly congregations = computed(() =>
    this.context.hasValue() ? this.context.value().congregations : [],
  );
  protected readonly scopeName = computed(() => {
    const sedes = this.congregations();
    return sedes.length === 1 ? sedes[0].name : 'toda la denominación';
  });

  protected readonly counts = computed<Record<RecordsTab, number>>(() => ({
    dedications: this.dedicationRows().length,
    marriages: this.marriageRows().length,
    pastoral: this.termRows().length,
  }));

  /** Open term per sede: the current pastor, suggested as officiant. */
  protected readonly currentPastors = computed(
    () =>
      new Map(
        this.termRows()
          .filter((term) => term.endedOn === null)
          .map((term) => [term.congregationId, term.pastor.id] as const),
      ),
  );
  protected readonly defaultOfficiantId = computed(() => {
    const sedes = this.congregations();
    return sedes.length === 1 ? (this.currentPastors().get(sedes[0].id) ?? null) : null;
  });
  protected readonly marriedPersonIds = computed(
    () =>
      new Set(
        this.marriageRows()
          .filter(isActiveMarriage)
          .flatMap((marriage) => [marriage.spouse1.id, marriage.spouse2.id]),
      ),
  );

  protected readonly stats = computed(() => {
    const year = todayIso().slice(0, 4);
    const dedications = this.dedicationRows();
    const marriages = this.marriageRows();
    const active = marriages.filter(isActiveMarriage).length;
    const openTerms = this.termRows().filter((term) => term.endedOn === null);
    const sedes = this.congregations();
    const current = sedes.length === 1 ? openTerms.find((term) => term.congregationId === sedes[0].id) : undefined;
    return {
      year,
      dedicationsThisYear: dedications.filter((row) => row.dedicatedOn.startsWith(year)).length,
      dedicationsTotal: dedications.length,
      marriagesActive: active,
      marriagesDissolved: marriages.length - active,
      pastorLabel: sedes.length === 1 ? `Pastor actual · ${sedes[0].name}` : 'Sedes con pastor asignado',
      pastorValue:
        sedes.length === 1 ? (current?.pastor.fullName ?? 'Sin pastor asignado') : `${openTerms.length} de ${sedes.length}`,
      pastorHint: current ? `Desde ${formatDate(current.startedOn, 'dd/MM/yyyy', this.locale)}` : null,
    };
  });

  protected readonly loading = computed(
    () => this.context.isLoading() || this.dedications.isLoading() || this.marriages.isLoading() || this.terms.isLoading(),
  );
  protected readonly loadError = computed(
    () => !!(this.context.error() || this.dedications.error() || this.marriages.error() || this.terms.error()),
  );

  protected selectTab(key: RecordsTab): void {
    this.tab.set(key);
  }

  /** Arrow keys move between tabs, as the ARIA tabs pattern expects. */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    this.tab.set(next.key);
    const tablist = (event.currentTarget as HTMLElement).parentElement;
    tablist?.querySelector<HTMLButtonElement>(`#records-tab-${next.key}`)?.focus();
  }

  protected openNew(): void {
    this.toast.set(null);
    switch (this.tab()) {
      case 'dedications':
        this.dedicationOpen.set(true);
        break;
      case 'marriages':
        this.marriageOpen.set(true);
        break;
      case 'pastoral':
        this.termOpen.set(true);
        break;
    }
  }

  protected openDissolution(marriage: Marriage): void {
    this.toast.set(null);
    this.dissolving.set(marriage);
    this.dissolutionOpen.set(true);
  }

  protected onSaved(message: string, resource: 'dedications' | 'marriages' | 'terms'): void {
    this.toast.set(message);
    this[resource].reload();
  }

  protected reloadAll(): void {
    this.context.reload();
    this.dedications.reload();
    this.marriages.reload();
    this.terms.reload();
  }
}
