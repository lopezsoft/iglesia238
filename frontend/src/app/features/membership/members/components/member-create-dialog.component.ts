import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, firstValueFrom, of, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import { ageOn } from '../../../../core/models/membership.model';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { MemberCreateInput, PersonOption, todayIso } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { PersonFieldsComponent } from './person-fields.component';
import { buildPersonForm, toPersonUpdate } from './person-form';

type Source = 'NEW' | 'EXISTING';
type BaptismChoice = '' | 'YES' | 'NO';

const MIN_SEARCH = 2;
const SEARCH_DEBOUNCE_MS = 250;
const ADULT_AGE = 18;

/**
 * Manual registration of a member: a person who is at the secretariat, or a legacy record. It does
 * what approving an application does (person, member, registry number, data consent), so a
 * published data policy is needed and the paper authorization must have been received.
 */
@Component({
  selector: 'app-member-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, PersonFieldsComponent, ReactiveFormsModule],
  styles: `
    @use 'tokens' as *;

    .source {
      display: flex;
      flex-wrap: wrap;
      gap: $space-1;
      padding: $space-1;
      border-radius: $radius-control;
      background: $color-surface-2;

      button {
        flex: 1 1 12rem;
        min-height: 2.25rem;
        border: 1px solid transparent;
        border-radius: $radius-control - 2px;
        background: transparent;
        color: $color-ink-muted;
        font-weight: $font-weight-medium;
        cursor: pointer;

        &[aria-pressed='true'] {
          border-color: $color-border;
          background: $color-surface;
          color: $color-primary;
        }
      }
    }

    .picker {
      display: flex;
      flex-direction: column;
      gap: $space-2;
    }

    .picked {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: $space-2;
      padding: $space-2 $space-3;
      border: 1px solid $color-primary;
      border-radius: $radius-control;
      background: $color-primary-soft;
      color: $color-primary-strong;
    }
  `,
  template: `
    <app-dialog [(open)]="open" title="Registrar miembro" variant="wide">
      <form
        id="member-create-form"
        class="stack"
        [formGroup]="membership"
        (ngSubmit)="submit()"
        novalidate
      >
        @if (error(); as message) {
          <p class="alert alert--danger" role="alert">{{ message }}</p>
        }

        <div class="source" role="group" aria-label="Persona a registrar">
          <button
            type="button"
            [attr.aria-pressed]="source() === 'NEW'"
            (click)="chooseSource('NEW')"
          >
            Persona nueva
          </button>
          <button
            type="button"
            [attr.aria-pressed]="source() === 'EXISTING'"
            (click)="chooseSource('EXISTING')"
          >
            Persona ya registrada
          </button>
        </div>

        @if (needsCongregation()) {
          <div class="field">
            <label for="create-congregation">Sede *</label>
            <select id="create-congregation" class="select" formControlName="congregationId">
              <option [ngValue]="0">Selecciona la sede</option>
              @for (option of congregations(); track option.id) {
                <option [ngValue]="option.id">{{ option.label }}</option>
              }
            </select>
            @if (submitted() && membership.controls.congregationId.value === 0) {
              <span class="field__error">Selecciona la sede en la que se registra el miembro.</span>
            }
          </div>
        }

        @if (source() === 'NEW') {
          <app-person-fields [form]="person" [submitted]="submitted()" idPrefix="create" />
        } @else {
          <div class="picker">
            @if (existing(); as picked) {
              <div class="picked">
                <span>
                  {{ picked.fullName }}
                  <span class="text-small mono">
                    {{ picked.maskedDocument ?? 'Sin documento' }}</span
                  >
                </span>
                <button type="button" class="btn btn--ghost btn--sm" (click)="existing.set(null)">
                  Cambiar
                </button>
              </div>
            } @else {
              <div class="field">
                <label for="create-existing-search">Buscar persona que aún no es miembro *</label>
                <input
                  id="create-existing-search"
                  class="input"
                  type="search"
                  autocomplete="off"
                  placeholder="Nombre o documento"
                  [value]="candidateText()"
                  (input)="candidateText.set($any($event.target).value)"
                />
              </div>
              @for (option of candidateOptions(); track option.id) {
                <button type="button" class="btn btn--secondary" (click)="existing.set(option)">
                  {{ option.fullName }}
                  <span class="text-muted text-small mono">
                    {{ option.maskedDocument ?? 'Sin documento' }}</span
                  >
                </button>
              } @empty {
                @if (candidateText().trim().length >= minSearch) {
                  <p class="text-muted text-small">
                    @if (candidates.isLoading()) {
                      Buscando…
                    } @else {
                      No hay personas que coincidan.
                    }
                  </p>
                }
              }
              @if (submitted() && !existing()) {
                <span class="field__error">Selecciona a la persona.</span>
              }
            }
          </div>
        }

        <div class="form-grid">
          <div class="field">
            <label for="create-joined-on">Fecha de ingreso</label>
            <input
              id="create-joined-on"
              class="input"
              type="date"
              formControlName="joinedOn"
              [max]="today"
            />
            <span class="field__hint">Vacía: hoy.</span>
          </div>
          <div class="field">
            <label for="create-baptized">Bautismo en agua</label>
            <select id="create-baptized" class="select" formControlName="baptism">
              <option value="">Sin dato</option>
              <option value="YES">Bautizado(a)</option>
              <option value="NO">No bautizado(a)</option>
            </select>
          </div>
          @if (membership.controls.baptism.value === 'YES') {
            <div class="field">
              <label for="create-baptism-date">Fecha del bautismo</label>
              <input
                id="create-baptism-date"
                class="input"
                type="date"
                formControlName="waterBaptismOn"
                [max]="today"
              />
            </div>
            <div class="field">
              <label for="create-baptism-place">Lugar del bautismo</label>
              <input id="create-baptism-place" class="input" formControlName="baptismPlace" />
            </div>
          }
          <div class="field">
            <label for="create-previous">Iglesia o sede anterior</label>
            <input id="create-previous" class="input" formControlName="previousCongregationName" />
          </div>
          <div class="field">
            <label for="create-book">Libro del registro</label>
            <input id="create-book" class="input" formControlName="registryBook" />
          </div>
          <div class="field">
            <label for="create-folio">Folio del registro</label>
            <input id="create-folio" class="input" formControlName="registryFolio" />
          </div>
        </div>

        @if (guardianVisible()) {
          <div class="picker">
            <p class="alert alert--warning text-small" role="note">
              Para un menor de edad, un adulto autoriza el tratamiento de sus datos.
            </p>
            @if (guardian(); as picked) {
              <div class="picked">
                <span>
                  {{ picked.fullName }}
                  <span class="text-small mono">
                    {{ picked.maskedDocument ?? 'Sin documento' }}</span
                  >
                </span>
                <button type="button" class="btn btn--ghost btn--sm" (click)="guardian.set(null)">
                  Cambiar
                </button>
              </div>
            } @else {
              <div class="field">
                <label for="create-guardian-search">Acudiente *</label>
                <input
                  id="create-guardian-search"
                  class="input"
                  type="search"
                  autocomplete="off"
                  placeholder="Nombre o documento del adulto"
                  [value]="guardianText()"
                  (input)="guardianText.set($any($event.target).value)"
                />
              </div>
              @for (option of guardianOptions(); track option.id) {
                <button type="button" class="btn btn--secondary" (click)="guardian.set(option)">
                  {{ option.fullName }}
                  <span class="text-muted text-small mono">
                    {{ option.maskedDocument ?? 'Sin documento' }}</span
                  >
                </button>
              }
              @if (submitted() && !guardian()) {
                <span class="field__error">Selecciona al acudiente.</span>
              }
            }
          </div>
        }

        <label class="checkbox">
          <input type="checkbox" formControlName="consentAccepted" />
          <span>
            Recibí la autorización firmada de tratamiento de datos personales (Ley 1581 de 2012). *
          </span>
        </label>
        @if (submitted() && !membership.controls.consentAccepted.value) {
          <span class="field__error">Confirma que recibiste la autorización firmada.</span>
        }
      </form>

      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="submit"
          form="member-create-form"
          class="btn btn--primary"
          [disabled]="pending()"
        >
          {{ pending() ? 'Registrando…' : 'Registrar miembro' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class MemberCreateDialogComponent {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  /** Emits the id of the new member. */
  readonly created = output<number>();

  protected readonly minSearch = MIN_SEARCH;
  protected readonly today = todayIso();
  protected readonly source = signal<Source>('NEW');
  protected readonly pending = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly guardianRequired = signal(false);

  protected readonly person = buildPersonForm(this.fb);
  protected readonly membership = this.fb.group({
    congregationId: [0],
    joinedOn: [''],
    baptism: ['' as BaptismChoice],
    waterBaptismOn: [''],
    baptismPlace: ['', Validators.maxLength(150)],
    previousCongregationName: ['', Validators.maxLength(150)],
    registryBook: ['', Validators.maxLength(20)],
    registryFolio: ['', Validators.maxLength(20)],
    consentAccepted: [false],
  });

  protected readonly existing = signal<PersonOption | null>(null);
  protected readonly candidateText = signal('');
  protected readonly guardian = signal<PersonOption | null>(null);
  protected readonly guardianText = signal('');
  private readonly birthDate = signal('');

  /** A denomination-wide user chooses the sede; a sede user registers in their own. */
  protected readonly needsCongregation = computed(() => this.auth.tenant().congregationId === null);
  protected readonly congregations = computed(() => {
    const tenant = this.auth.tenant();
    return (this.auth.user()?.selectableScopes ?? [])
      .filter(
        (scope) =>
          scope.kind === 'CONGREGATION' &&
          scope.denominationId === tenant.denominationId &&
          scope.congregationId !== null,
      )
      .map((scope) => ({ id: scope.congregationId as number, label: scope.label }));
  });

  protected readonly guardianVisible = computed(() => {
    if (this.guardianRequired()) {
      return true;
    }
    if (this.source() === 'EXISTING') {
      return false;
    }
    const age = ageOn(this.birthDate() || null, todayIso());
    return age !== null && age < ADULT_AGE;
  });

  protected readonly candidates = rxResource({
    params: () => {
      const text = this.candidateText().trim();
      return this.open() &&
        this.source() === 'EXISTING' &&
        !this.existing() &&
        text.length >= MIN_SEARCH
        ? text
        : undefined;
    },
    stream: ({ params }) =>
      of(params).pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap((text) => this.repository.searchCandidates(text)),
      ),
  });
  protected readonly candidateOptions = computed(() =>
    this.candidates.hasValue() ? (this.candidates.value() ?? []) : [],
  );

  protected readonly guardianResults = rxResource({
    params: () => {
      const text = this.guardianText().trim();
      return this.open() && this.guardianVisible() && !this.guardian() && text.length >= MIN_SEARCH
        ? text
        : undefined;
    },
    stream: ({ params }) =>
      of(params).pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap((text) => this.repository.searchGuardians(text)),
      ),
  });
  protected readonly guardianOptions = computed(() =>
    this.guardianResults.hasValue() ? (this.guardianResults.value() ?? []) : [],
  );

  constructor() {
    this.person.controls.birthDate.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.birthDate.set(value));
    effect(() => {
      if (!this.open()) {
        return;
      }
      untracked(() => this.reset());
    });
  }

  protected chooseSource(source: Source): void {
    this.source.set(source);
    this.error.set(null);
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.person.markAllAsTouched();
    this.membership.markAllAsTouched();
    if (this.pending() || !this.isValid()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const detail = await firstValueFrom(this.repository.createMember(this.toInput()));
      this.open.set(false);
      this.created.emit(detail.id);
    } catch (error) {
      if (error instanceof DomainError) {
        if (error.code === 'GUARDIAN_REQUIRED') {
          this.guardianRequired.set(true);
        }
        if (error.code === 'DUPLICATE_DOCUMENT' || error.code === 'PERSON_EXISTS') {
          this.person.controls.documentNumber.setErrors({ duplicate: error.message });
        }
      }
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private isValid(): boolean {
    const value = this.membership.getRawValue();
    if (this.membership.invalid || !value.consentAccepted) {
      return false;
    }
    if (this.needsCongregation() && value.congregationId === 0) {
      return false;
    }
    if (this.source() === 'NEW' ? this.person.invalid : this.existing() === null) {
      return false;
    }
    return !this.guardianVisible() || this.guardian() !== null;
  }

  private toInput(): MemberCreateInput {
    const value = this.membership.getRawValue();
    const optional = (text: string): string | null => (text.trim() === '' ? null : text.trim());
    const baptized = value.baptism === 'YES';
    return {
      congregationId: this.needsCongregation() ? value.congregationId : null,
      existingPersonId: this.source() === 'EXISTING' ? (this.existing()?.id ?? null) : null,
      person: this.source() === 'NEW' ? toPersonUpdate(this.person.getRawValue()) : null,
      joinedOn: optional(value.joinedOn),
      isBaptized: value.baptism === '' ? null : baptized,
      waterBaptismOn: baptized ? optional(value.waterBaptismOn) : null,
      baptismPlace: baptized ? optional(value.baptismPlace) : null,
      previousCongregationName: optional(value.previousCongregationName),
      registryBook: optional(value.registryBook),
      registryFolio: optional(value.registryFolio),
      guardianPersonId: this.guardianVisible() ? (this.guardian()?.id ?? null) : null,
      consentAccepted: value.consentAccepted,
    };
  }

  private reset(): void {
    this.source.set('NEW');
    this.submitted.set(false);
    this.error.set(null);
    this.guardianRequired.set(false);
    this.existing.set(null);
    this.candidateText.set('');
    this.guardian.set(null);
    this.guardianText.set('');
    this.birthDate.set('');
    this.person.reset();
    this.membership.reset({
      congregationId: this.congregations().length === 1 ? this.congregations()[0].id : 0,
      baptism: '',
      consentAccepted: false,
    });
  }
}
