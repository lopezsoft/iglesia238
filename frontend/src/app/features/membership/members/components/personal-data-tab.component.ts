import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { catalogName } from '../../../../core/models/catalogs';
import { ageOn } from '../../../../core/models/membership.model';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { MemberDetail, SEX_LABELS, documentLabel, todayIso } from '../data/members.models';

/** Personal and membership data of the file. Editing happens in dialogs opened from here or the header. */
@Component({
  selector: 'app-personal-data-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent],
  styleUrl: './member-tab.scss',
  template: `
    @let person = member().person;
    <div class="tab__header">
      <h2>Datos personales</h2>
    </div>
    <dl class="details">
      <div>
        <dt>Nombres</dt>
        <dd>{{ person.firstName }}</dd>
      </div>
      <div>
        <dt>Apellidos</dt>
        <dd>{{ person.lastName }} {{ person.secondLastName }}</dd>
      </div>
      <div>
        <dt>Tipo y número de documento</dt>
        <dd class="mono">{{ document() }}</dd>
      </div>
      <div>
        <dt>Fecha de nacimiento</dt>
        <dd>
          @if (person.birthDate) {
            {{ person.birthDate | date: 'dd/MM/yyyy' }} ({{ age() }} años)
          } @else {
            —
          }
        </dd>
      </div>
      <div>
        <dt>Sexo</dt>
        <dd>{{ person.sex ? sexLabels[person.sex] : '—' }}</dd>
      </div>
      <div>
        <dt>Estado civil</dt>
        <dd>{{ maritalStatus() }}</dd>
      </div>
      <div>
        <dt>Nivel educativo</dt>
        <dd>{{ educationLevel() }}</dd>
      </div>
      <div>
        <dt>Profesión</dt>
        <dd>{{ person.profession ?? '—' }}</dd>
      </div>
      <div>
        <dt>Ocupación</dt>
        <dd>{{ person.occupation ?? '—' }}</dd>
      </div>
      <div>
        <dt>Dirección</dt>
        <dd>{{ person.address ?? '—' }}</dd>
      </div>
      <div>
        <dt>Municipio de residencia</dt>
        <dd>{{ municipality() }}</dd>
      </div>
      <div>
        <dt>Teléfono celular</dt>
        <dd class="mono">{{ person.phone ?? '—' }}</dd>
      </div>
      <div>
        <dt>Correo electrónico</dt>
        <dd>{{ person.email ?? '—' }}</dd>
      </div>
    </dl>

    <div class="tab__header">
      <h2>Datos de membresía</h2>
      @if (canWrite()) {
        <button type="button" class="btn btn--secondary btn--sm" (click)="editMembership.emit()">
          <app-icon name="edit" [size]="14" />
          Editar membresía
        </button>
      }
    </div>
    <dl class="details">
      <div>
        <dt>Bautismo en agua</dt>
        <dd>{{ baptism() }}</dd>
      </div>
      @if (member().baptismPlace) {
        <div>
          <dt>Lugar del bautismo</dt>
          <dd>{{ member().baptismPlace }}</dd>
        </div>
      }
      <div>
        <dt>Fecha de ingreso a la denominación</dt>
        <dd>{{ member().joinedOn ? (member().joinedOn | date: 'dd/MM/yyyy') : '—' }}</dd>
      </div>
      <div>
        <dt>Iglesia o sede anterior</dt>
        <dd>{{ member().previousCongregationName ?? '—' }}</dd>
      </div>
    </dl>
  `,
})
export class PersonalDataTabComponent {
  private readonly auth = inject(AuthService);
  private readonly catalogs = inject(CatalogsStore);

  readonly member = input.required<MemberDetail>();
  /** The user wants to edit the membership data (join date, baptism). */
  readonly editMembership = output<void>();

  protected readonly sexLabels = SEX_LABELS;
  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  protected readonly document = computed(() =>
    documentLabel(this.member().person.documentTypeCode, this.member().person.documentNumber),
  );
  protected readonly age = computed(() => ageOn(this.member().person.birthDate, todayIso()));
  protected readonly maritalStatus = computed(() =>
    catalogName(this.catalogs.maritalStatuses(), this.member().person.maritalStatusCode),
  );
  protected readonly educationLevel = computed(() =>
    catalogName(this.catalogs.educationLevels(), this.member().person.educationLevelCode),
  );
  protected readonly municipality = computed(() => {
    const code = this.member().person.municipalityCode;
    return code ? this.catalogs.municipalityLabel(code) : '—';
  });
  protected readonly baptism = computed(() => {
    const member = this.member();
    if (member.isBaptized === null) {
      return 'Sin dato';
    }
    if (!member.isBaptized) {
      return 'No bautizado(a)';
    }
    return member.waterBaptismOn
      ? `Sí, el ${formatDate(member.waterBaptismOn)}`
      : 'Sí (fecha sin registrar)';
  });

  constructor() {
    // The labels come from the API: load the catalogs and resolve the municipality of the person.
    this.catalogs.load().subscribe({ error: () => undefined });
  }
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
