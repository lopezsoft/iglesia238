import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogsStore } from '../../../core/catalogs/catalogs.store';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { MEMBER_STATUS_LABELS } from '../../../core/models/membership.model';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { ConsentTabComponent } from './components/consent-tab.component';
import { FamilyTabComponent } from './components/family-tab.component';
import { MembershipEditDialogComponent } from './components/membership-edit-dialog.component';
import { PersonEditDialogComponent } from './components/person-edit-dialog.component';
import { PersonalDataTabComponent } from './components/personal-data-tab.component';
import { PositionsTabComponent } from './components/positions-tab.component';
import { RegistryTabComponent } from './components/registry-tab.component';
import { SocioeconomicTabComponent } from './components/socioeconomic-tab.component';
import { StatusDialogComponent } from './components/status-dialog.component';
import { StudiesTabComponent } from './components/studies-tab.component';
import { TransferDialogComponent } from './components/transfer-dialog.component';
import {
  MANUAL_STATUS_TARGETS,
  MEMBER_STATUS_TONES,
  TransferResult,
  documentLabel,
  initialsOf,
} from './data/members.models';
import { MembersRepository } from './data/members.repository';

type MemberTab =
  'personal' | 'family' | 'studies' | 'positions' | 'socioeconomic' | 'registry' | 'consent';

const TABS: readonly TabCardItem<MemberTab>[] = [
  { id: 'personal', title: 'Datos personales', subtitle: 'Identidad y membresía', icon: 'user' },
  { id: 'family', title: 'Familia', subtitle: 'Parentescos', icon: 'users' },
  { id: 'studies', title: 'Estudios', subtitle: 'Formación', icon: 'book' },
  { id: 'positions', title: 'Cargos y grados', subtitle: 'Servicio en la iglesia', icon: 'church' },
  {
    id: 'socioeconomic',
    title: 'Ficha socioeconómica',
    subtitle: 'Acceso restringido',
    icon: 'heart',
  },
  {
    id: 'registry',
    title: 'Registro y traslados',
    subtitle: 'Libros e historial',
    icon: 'transfer',
  },
  {
    id: 'consent',
    title: 'Autorización de datos',
    subtitle: 'Ley 1581 de 2012',
    icon: 'shield-check',
  },
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
    MembershipEditDialogComponent,
    PersonEditDialogComponent,
    PersonalDataTabComponent,
    PositionsTabComponent,
    RegistryTabComponent,
    SocioeconomicTabComponent,
    StatusBadgeComponent,
    StatusDialogComponent,
    StudiesTabComponent,
    TabCardsComponent,
    TransferDialogComponent,
  ],
  templateUrl: './member-detail.page.html',
  styleUrl: './member-detail.page.scss',
})
export class MemberDetailPage {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly catalogs = inject(CatalogsStore);

  /** Route parameter `:id`. */
  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly statusLabels = MEMBER_STATUS_LABELS;
  protected readonly statusTones = MEMBER_STATUS_TONES;
  protected readonly documentLabel = documentLabel;

  protected readonly memberId = computed(() => Number(this.id()));

  // The router reuses this page when only `:id` changes (e.g. a relative's link in Familia), so
  // the tab and the notices of the previous member are reset with the id.
  protected readonly activeTab = linkedSignal<number, string>({
    source: this.memberId,
    computation: () => 'personal',
  });
  protected readonly editOpen = signal(false);
  protected readonly membershipOpen = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly transferOpen = signal(false);
  protected readonly transferNotice = linkedSignal<number, string | null>({
    source: this.memberId,
    computation: () => null,
  });
  protected readonly savedNotice = linkedSignal<number, string | null>({
    source: this.memberId,
    computation: () => null,
  });
  /** Bumped after a transfer or a status change so the registry tab reloads its timeline. */
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
  protected readonly fullName = computed(() => {
    const person = this.detail()?.person;
    return person
      ? [person.firstName, person.lastName, person.secondLastName].filter(Boolean).join(' ')
      : '';
  });
  protected readonly canTransfer = computed(
    () => this.canWrite() && this.detail()?.status === 'ACTIVE',
  );
  protected readonly canChangeStatus = computed(() => {
    const status = this.detail()?.status;
    return this.canWrite() && status !== undefined && MANUAL_STATUS_TARGETS[status].length > 0;
  });
  protected readonly congregationPlace = computed(() => {
    const member = this.detail();
    if (!member) {
      return '';
    }
    const municipality = member.congregationMunicipalityCode
      ? this.catalogs.municipalityLabel(member.congregationMunicipalityCode)
      : '—';
    return municipality === '—'
      ? member.congregationName
      : `${member.congregationName} · ${municipality}`;
  });

  constructor() {
    // Names of the municipality of the sede come from the API: resolve the code once.
    effect(() => {
      const code = this.detail()?.congregationMunicipalityCode;
      if (code && this.catalogs.municipalityLabel(code) === '—') {
        this.catalogs.resolveMunicipality(code).subscribe({ error: () => undefined });
      }
    });
  }

  protected onPersonSaved(): void {
    this.savedNotice.set('Datos personales actualizados.');
    this.member.reload();
  }

  protected onMembershipSaved(): void {
    this.savedNotice.set('Datos de membresía actualizados.');
    this.member.reload();
  }

  protected onStatusChanged(): void {
    this.savedNotice.set('Estado del miembro actualizado.');
    this.revision.update((value) => value + 1);
    this.member.reload();
  }

  protected onAnonymized(): void {
    this.savedNotice.set('Los datos personales fueron anonimizados.');
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
