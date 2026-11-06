import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  MunicipalityPicked,
  MunicipalitySelectComponent,
} from '../../../organization/structure/components/municipality-select.component';
import { MemberDetail, MembershipDataInput, todayIso } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';

type BaptismChoice = '' | 'YES' | 'NO';

/** Edits the data of the file that belong to the membership, not to the person: join date and baptism. */
@Component({
  selector: 'app-membership-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, MunicipalitySelectComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" title="Editar datos de membresía" variant="wide">
      <form
        id="membership-edit-form"
        class="stack"
        [formGroup]="form"
        (ngSubmit)="submit()"
        novalidate
      >
        @if (error(); as message) {
          <p class="alert alert--danger" role="alert">{{ message }}</p>
        }
        <div class="form-grid">
          <div class="field">
            <label for="membership-joined-on">Fecha de ingreso</label>
            <input
              id="membership-joined-on"
              class="input"
              type="date"
              formControlName="joinedOn"
              [max]="today"
            />
          </div>
          <div class="field">
            <label for="membership-converted-on">Fecha de conversión</label>
            <input
              id="membership-converted-on"
              class="input"
              type="date"
              formControlName="convertedOn"
              [max]="today"
            />
          </div>
          <div class="field">
            <label for="membership-baptized">Bautismo en agua</label>
            <select id="membership-baptized" class="select" formControlName="baptism">
              <option value="">Sin dato</option>
              <option value="YES">Bautizado(a)</option>
              <option value="NO">No bautizado(a)</option>
            </select>
          </div>
          @if (form.controls.baptism.value === 'YES') {
            <div class="field">
              <label for="membership-baptism-date">Fecha del bautismo</label>
              <input
                id="membership-baptism-date"
                class="input"
                type="date"
                formControlName="waterBaptismOn"
                [max]="today"
              />
            </div>
            <div class="field">
              <label for="membership-baptism-region">Departamento del bautismo</label>
              <select
                id="membership-baptism-region"
                class="select"
                [value]="baptismRegionCode()"
                (change)="onBaptismRegionChange($any($event.target).value)"
              >
                <option value="">Selecciona el departamento…</option>
                @for (region of catalogs.defaultRegions(); track region.code) {
                  <option [value]="region.code">{{ region.name }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="membership-baptism-municipality">Municipio del bautismo</label>
              <app-municipality-select
                inputId="membership-baptism-municipality"
                [selectByRegion]="true"
                [regionCode]="baptismRegionCode()"
                [code]="baptismMunicipalityCode()"
                [label]="baptismMunicipalityLabel()"
                (picked)="onBaptismMunicipalityPicked($event)"
                (cleared)="onBaptismMunicipalityCleared()"
              />
            </div>
            <div class="field">
              <label for="membership-baptism-place">Congregación o lugar del bautismo</label>
              <input id="membership-baptism-place" class="input" formControlName="baptismPlace" />
              @if (form.controls.baptismPlace.invalid) {
                <span class="field__error">Máximo 150 caracteres.</span>
              }
            </div>
            <div class="field">
              <label for="membership-baptizing-pastor">Pastor que bautizó</label>
              <input
                id="membership-baptizing-pastor"
                class="input"
                formControlName="baptizingPastorName"
              />
            </div>
          }
          <div class="field">
            <label for="membership-holy-spirit">Bautismo del Espíritu Santo</label>
            <input
              id="membership-holy-spirit"
              class="input"
              type="date"
              formControlName="holySpiritBaptismOn"
              [max]="today"
            />
          </div>
          <div class="field">
            <label for="membership-reconciled-on">Fecha de reconciliación</label>
            <input
              id="membership-reconciled-on"
              class="input"
              type="date"
              formControlName="reconciledOn"
              [max]="today"
            />
          </div>
          <div class="field">
            <label for="membership-previous">Iglesia o sede anterior</label>
            <input
              id="membership-previous"
              class="input"
              formControlName="previousCongregationName"
            />
            @if (form.controls.previousCongregationName.invalid) {
              <span class="field__error">Máximo 150 caracteres.</span>
            }
          </div>
          <div class="field">
            <label for="membership-teacher">Maestro(a) de Educación Cristiana</label>
            <select id="membership-teacher" class="select" formControlName="teacher">
              <option value="">Sin dato</option>
              <option value="YES">Sí</option>
              <option value="NO">No</option>
            </select>
          </div>
          <div class="field field--full">
            <label for="membership-desired-areas">Áreas de servicio en las que desea servir</label>
            <input
              id="membership-desired-areas"
              class="input"
              formControlName="desiredAreas"
            />
          </div>
          <div class="field field--full">
            <label for="membership-pastor-notes">Observaciones del pastor</label>
            <input
              id="membership-pastor-notes"
              class="input"
              formControlName="pastorNotes"
            />
          </div>
        </div>
        <p class="text-muted text-small">
          El bautismo en agua se exige para emitir certificados de bautismo.
        </p>
      </form>

      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="submit"
          form="membership-edit-form"
          class="btn btn--primary"
          [disabled]="pending()"
        >
          {{ pending() ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class MembershipEditDialogComponent {
  private readonly repository = inject(MembersRepository);
  protected readonly catalogs = inject(CatalogsStore);

  readonly open = model(false);
  readonly member = input.required<MemberDetail>();
  readonly saved = output<void>();

  protected readonly today = todayIso();
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly baptismRegionCode = signal('');
  protected readonly baptismMunicipalityCode = signal('');
  protected readonly baptismMunicipalityLabel = computed(() => {
    const code = this.baptismMunicipalityCode();
    return code ? this.catalogs.municipalityLabel(code) : '';
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    joinedOn: [''],
    convertedOn: [''],
    baptism: ['' as BaptismChoice],
    waterBaptismOn: [''],
    baptismMunicipalityCode: [''],
    baptismPlace: ['', Validators.maxLength(150)],
    baptizingPastorName: ['', Validators.maxLength(150)],
    holySpiritBaptismOn: [''],
    reconciledOn: [''],
    previousCongregationName: ['', Validators.maxLength(150)],
    teacher: ['' as BaptismChoice],
    desiredAreas: ['', Validators.maxLength(500)],
    pastorNotes: ['', Validators.maxLength(1000)],
  });

  constructor() {
    if (typeof this.catalogs.loadDefaultRegions === 'function') {
      this.catalogs
        .loadDefaultRegions()
        .pipe(takeUntilDestroyed())
        .subscribe({ error: () => undefined });
    }
    effect(() => {
      if (!this.open()) {
        return;
      }
      const member = this.member();
      untracked(() => {
        this.error.set(null);
        const munCode = member.baptismMunicipalityCode ?? '';
        this.baptismMunicipalityCode.set(munCode);
        this.baptismRegionCode.set(munCode.length >= 2 ? munCode.slice(0, 2) : '');
        if (munCode && this.catalogs.municipalityLabel(munCode) === '—') {
          this.catalogs.resolveMunicipality(munCode).subscribe({
            next: (mun) => this.baptismRegionCode.set(mun.regionCode),
            error: () => undefined,
          });
        }
        this.form.reset({
          joinedOn: member.joinedOn ?? '',
          convertedOn: member.convertedOn ?? '',
          baptism: member.isBaptized === null ? '' : member.isBaptized ? 'YES' : 'NO',
          waterBaptismOn: member.waterBaptismOn ?? '',
          baptismMunicipalityCode: munCode,
          baptismPlace: member.baptismPlace ?? '',
          baptizingPastorName: member.baptizingPastorName ?? '',
          holySpiritBaptismOn: member.holySpiritBaptismOn ?? '',
          reconciledOn: member.reconciledOn ?? '',
          previousCongregationName: member.previousCongregationName ?? '',
          teacher:
            member.isChristianEducationTeacher === null ||
            member.isChristianEducationTeacher === undefined
              ? ''
              : member.isChristianEducationTeacher
                ? 'YES'
                : 'NO',
          desiredAreas: member.desiredAreas ?? '',
          pastorNotes: member.pastorNotes ?? '',
        });
      });
    });
  }

  protected onBaptismRegionChange(regionCode: string): void {
    this.baptismRegionCode.set(regionCode);
    this.baptismMunicipalityCode.set('');
    this.form.controls.baptismMunicipalityCode.setValue('');
  }

  protected onBaptismMunicipalityPicked(picked: MunicipalityPicked): void {
    this.baptismMunicipalityCode.set(picked.code);
    this.form.controls.baptismMunicipalityCode.setValue(picked.code);
  }

  protected onBaptismMunicipalityCleared(): void {
    this.baptismMunicipalityCode.set('');
    this.form.controls.baptismMunicipalityCode.setValue('');
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.repository.updateMembership(this.member().id, this.toInput()));
      this.open.set(false);
      this.saved.emit();
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private toInput(): MembershipDataInput {
    const value = this.form.getRawValue();
    const optional = (text: string): string | null => (text.trim() === '' ? null : text.trim());
    const baptized = value.baptism === 'YES';
    return {
      joinedOn: optional(value.joinedOn),
      convertedOn: optional(value.convertedOn),
      isBaptized: value.baptism === '' ? null : baptized,
      waterBaptismOn: baptized ? optional(value.waterBaptismOn) : null,
      baptismMunicipalityCode: baptized ? optional(value.baptismMunicipalityCode) : null,
      baptismPlace: baptized ? optional(value.baptismPlace) : null,
      baptizingPastorName: baptized ? optional(value.baptizingPastorName) : null,
      holySpiritBaptismOn: optional(value.holySpiritBaptismOn),
      reconciledOn: optional(value.reconciledOn),
      previousCongregationName: optional(value.previousCongregationName),
      isChristianEducationTeacher: value.teacher === '' ? null : value.teacher === 'YES',
      desiredAreas: optional(value.desiredAreas),
      pastorNotes: optional(value.pastorNotes),
    };
  }
}
