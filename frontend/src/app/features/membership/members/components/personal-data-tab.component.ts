import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
  catalogName,
  municipalityLabel,
} from '../../../../core/models/catalogs';
import { ageOn } from '../../../../core/models/membership.model';
import { MemberDetail, SEX_LABELS, documentLabel, todayIso } from '../data/members.models';

/** Read-only personal data; editing happens in the dialog opened from the header. */
@Component({
  selector: 'app-personal-data-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
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
      <div>
        <dt>Bautismo en agua</dt>
        <dd>{{ baptism() }}</dd>
      </div>
      <div>
        <dt>Fecha de ingreso a la denominación</dt>
        <dd>{{ member().joinedOn ? (member().joinedOn | date: 'dd/MM/yyyy') : '—' }}</dd>
      </div>
      @if (member().previousCongregationName) {
        <div>
          <dt>Iglesia o sede anterior</dt>
          <dd>{{ member().previousCongregationName }}</dd>
        </div>
      }
    </dl>
  `,
})
export class PersonalDataTabComponent {
  readonly member = input.required<MemberDetail>();

  protected readonly sexLabels = SEX_LABELS;
  protected readonly document = computed(() =>
    documentLabel(this.member().person.documentTypeCode, this.member().person.documentNumber),
  );
  protected readonly age = computed(() => ageOn(this.member().person.birthDate, todayIso()));
  protected readonly maritalStatus = computed(() =>
    catalogName(MARITAL_STATUSES, this.member().person.maritalStatusCode),
  );
  protected readonly educationLevel = computed(() =>
    catalogName(EDUCATION_LEVELS, this.member().person.educationLevelCode),
  );
  protected readonly municipality = computed(() =>
    municipalityLabel(this.member().person.municipalityCode),
  );
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
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
