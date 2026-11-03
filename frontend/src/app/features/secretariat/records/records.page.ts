import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { ErrorBannerComponent, LoadingComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { CloseTermDialogComponent } from './components/close-term-dialog.component';
import { DedicationDialogComponent } from './components/dedication-dialog.component';
import { DedicationsPanelComponent } from './components/dedications-panel.component';
import { DissolutionDialogComponent } from './components/dissolution-dialog.component';
import { MarriageDialogComponent } from './components/marriage-dialog.component';
import { MarriagesPanelComponent } from './components/marriages-panel.component';
import { PastoralTermDialogComponent } from './components/pastoral-term-dialog.component';
import { PastoralTermsPanelComponent } from './components/pastoral-terms-panel.component';
import { Marriage, PastoralTerm, PersonSummary } from './data/records.models';
import { RecordsRepository } from './data/records.repository';

type RecordsTab = 'dedications' | 'marriages' | 'pastoral';

interface TabDefinition extends TabCardItem<RecordsTab> {
  readonly newLabel: string;
}

const TABS: readonly TabDefinition[] = [
  {
    id: 'dedications',
    title: 'Presentación de niños',
    subtitle: 'Niños presentados y sus padres',
    icon: 'heart',
    newLabel: 'Nueva presentación',
  },
  {
    id: 'marriages',
    title: 'Matrimonios',
    subtitle: 'Vigentes y disueltos',
    icon: 'users',
    newLabel: 'Nuevo matrimonio',
  },
  {
    id: 'pastoral',
    title: 'Periodos pastorales',
    subtitle: 'Pastores por sede',
    icon: 'church',
    newLabel: 'Nuevo periodo',
  },
];

/** D-04 and D-05: presentations of children, marriages and pastoral terms of the active scope. */
@Component({
  selector: 'app-records-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    StatCardComponent,
    TabCardsComponent,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
    DedicationsPanelComponent,
    MarriagesPanelComponent,
    PastoralTermsPanelComponent,
    DedicationDialogComponent,
    MarriageDialogComponent,
    DissolutionDialogComponent,
    PastoralTermDialogComponent,
    CloseTermDialogComponent,
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
  protected readonly activeTab = computed(
    () => TABS.find((tab) => tab.id === this.tab()) ?? TABS[0],
  );
  protected readonly toast = signal<string | null>(null);
  /** Bumped after every change so the panels reload their lists. */
  protected readonly version = signal(0);

  protected readonly dedicationOpen = signal(false);
  protected readonly marriageOpen = signal(false);
  protected readonly termOpen = signal(false);
  protected readonly dissolutionOpen = signal(false);
  protected readonly dissolving = signal<Marriage | null>(null);
  protected readonly closeTermOpen = signal(false);
  protected readonly closing = signal<PastoralTerm | null>(null);

  protected readonly context = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.context(),
  });
  protected readonly summary = rxResource({
    params: () => ({ tenant: this.auth.tenant(), version: this.version() }),
    stream: () => this.repository.summary(),
  });
  protected readonly terms = rxResource({
    params: () => ({ tenant: this.auth.tenant(), version: this.version() }),
    stream: () => this.repository.pastoralTerms(),
  });

  protected readonly contextData = computed(() =>
    this.context.hasValue() ? this.context.value() : null,
  );
  protected readonly summaryData = computed(() =>
    this.summary.hasValue() ? this.summary.value() : null,
  );
  protected readonly termRows = computed(() => (this.terms.hasValue() ? this.terms.value() : []));
  protected readonly congregations = computed(() => this.contextData()?.congregations ?? []);
  protected readonly today = computed(() => this.contextData()?.today ?? '');
  protected readonly loadError = computed(() => userMessage(this.context.error()));

  protected readonly scopeName = computed(() => {
    const sedes = this.congregations();
    return sedes.length === 1 ? sedes[0].name : 'toda la denominación';
  });

  /** Open term per sede: the current pastor, suggested as officiant. */
  protected readonly currentPastors = computed<ReadonlyMap<number, PersonSummary>>(
    () =>
      new Map(
        this.termRows()
          .filter((term) => term.endedOn === null)
          .map((term) => [term.congregationId, term.pastor] as const),
      ),
  );
  protected readonly defaultOfficiant = computed(() => {
    const sedes = this.congregations();
    return sedes.length === 1 ? (this.currentPastors().get(sedes[0].id) ?? null) : null;
  });

  protected readonly pastorCard = computed(() => {
    const summary = this.summaryData();
    if (!summary) {
      return { label: 'Pastor actual', value: '—', hint: null as string | null };
    }
    if (summary.currentPastor) {
      return {
        label: `Pastor actual · ${summary.currentPastor.congregationName}`,
        value: summary.currentPastor.fullName,
        hint: `Desde ${formatDate(summary.currentPastor.startedOn, 'dd/MM/yyyy', this.locale)}`,
      };
    }
    return this.congregations().length === 1
      ? {
          label: `Pastor actual · ${this.congregations()[0].name}`,
          value: 'Sin pastor asignado',
          hint: null,
        }
      : {
          label: 'Sedes con pastor asignado',
          value: `${summary.congregationsWithPastor} de ${summary.congregationsTotal}`,
          hint: null,
        };
  });

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

  protected openCloseTerm(term: PastoralTerm): void {
    this.toast.set(null);
    this.closing.set(term);
    this.closeTermOpen.set(true);
  }

  protected onSaved(message: string): void {
    this.toast.set(message);
    this.version.update((value) => value + 1);
  }
}
