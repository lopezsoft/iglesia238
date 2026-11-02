import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { municipalityLabel } from '../../../core/models/catalogs';
import { MEMBER_STATUS_LABELS } from '../../../core/models/membership.model';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { ConsentTabComponent } from './components/consent-tab.component';
import { FamilyTabComponent } from './components/family-tab.component';
import { PersonEditDialogComponent } from './components/person-edit-dialog.component';
import { PersonalDataTabComponent } from './components/personal-data-tab.component';
import { PositionsTabComponent } from './components/positions-tab.component';
import { RegistryTabComponent } from './components/registry-tab.component';
import { SocioeconomicTabComponent } from './components/socioeconomic-tab.component';
import { StudiesTabComponent } from './components/studies-tab.component';
import { TransferDialogComponent } from './components/transfer-dialog.component';
import {
  MEMBER_STATUS_TONES,
  TransferResult,
  documentLabel,
  initialsOf,
} from './data/members.models';
import { MembersRepository } from './data/members.repository';

type MemberTab =
  'personal' | 'family' | 'studies' | 'positions' | 'socioeconomic' | 'registry' | 'consent';

const TABS: readonly { readonly id: MemberTab; readonly label: string }[] = [
  { id: 'personal', label: 'Datos personales' },
  { id: 'family', label: 'Familia' },
  { id: 'studies', label: 'Estudios' },
  { id: 'positions', label: 'Cargos y grados' },
  { id: 'socioeconomic', label: 'Ficha socioeconómica' },
  { id: 'registry', label: 'Registro y traslados' },
  { id: 'consent', label: 'Autorización de datos' },
];

@Component({
  selector: 'app-member-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    ConsentTabComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    FamilyTabComponent,
    IconComponent,
    LoadingComponent,
    PersonEditDialogComponent,
    PersonalDataTabComponent,
    PositionsTabComponent,
    RegistryTabComponent,
    SocioeconomicTabComponent,
    StatusBadgeComponent,
    StudiesTabComponent,
    TransferDialogComponent,
  ],
  templateUrl: './member-detail.page.html',
  styleUrl: './member-detail.page.scss',
})
export class MemberDetailPage {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Route parameter `:id`. */
  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly statusLabels = MEMBER_STATUS_LABELS;
  protected readonly statusTones = MEMBER_STATUS_TONES;
  protected readonly documentLabel = documentLabel;
  protected readonly municipalityLabel = municipalityLabel;

  protected readonly memberId = computed(() => Number(this.id()));

  // The router reuses this page when only `:id` changes (e.g. a relative's link in Familia), so
  // the tab and the notices of the previous member are reset with the id.
  protected readonly activeTab = linkedSignal<number, MemberTab>({
    source: this.memberId,
    computation: () => 'personal',
  });
  protected readonly editOpen = signal(false);
  protected readonly transferOpen = signal(false);
  protected readonly transferNotice = linkedSignal<number, string | null>({
    source: this.memberId,
    computation: () => null,
  });
  protected readonly savedNotice = linkedSignal<number, string | null>({
    source: this.memberId,
    computation: () => null,
  });
  /** Bumped after a transfer so the registry tab reloads its timeline. */
  protected readonly revision = signal(0);
  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  protected readonly canIssueCertificates = computed(() => this.auth.can('certificates.issue'));

  protected readonly member = rxResource({
    params: () => ({ id: this.memberId(), tenant: this.auth.tenant() }),
    stream: ({ params }) => this.repository.detail(params.id),
  });

  protected readonly detail = computed(() => (this.member.hasValue() ? this.member.value() : null));
  protected readonly notFound = computed(() => {
    const error = this.member.error();
    return error instanceof DomainError && error.code === 'NOT_FOUND';
  });
  protected readonly loadError = computed(() =>
    this.member.error() ? userMessage(this.member.error()) : null,
  );
  protected readonly initials = computed(() => {
    const person = this.detail()?.person;
    return person ? initialsOf(person.firstName, person.lastName) : '';
  });
  protected readonly canTransfer = computed(
    () => this.canWrite() && this.detail()?.status === 'ACTIVE',
  );

  protected selectTab(tab: MemberTab): void {
    this.activeTab.set(tab);
  }

  /** Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern). */
  protected onTabKeydown(event: KeyboardEvent): void {
    const index = TABS.findIndex((tab) => tab.id === this.activeTab());
    const moves: Readonly<Record<string, number>> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    this.activeTab.set(TABS[next].id);
    const tablist = event.currentTarget as HTMLElement;
    tablist.querySelector<HTMLElement>(`#member-tab-${TABS[next].id}`)?.focus();
  }

  protected onPersonSaved(): void {
    this.savedNotice.set('Datos personales actualizados.');
    this.member.reload();
  }

  protected onTransferred(result: TransferResult): void {
    if (!result.stillVisible) {
      void this.router.navigate(['/members'], { queryParams: { transferred: 1 } });
      return;
    }
    this.transferNotice.set(
      result.kind === 'INTERNAL'
        ? `Destino: ${result.destinationName}. Se abrió una nueva inscripción en el libro de la sede destino.`
        : `Destino: ${result.destinationName}. La persona quedó en estado Trasladado.`,
    );
    this.revision.update((value) => value + 1);
    this.member.reload();
  }
}
