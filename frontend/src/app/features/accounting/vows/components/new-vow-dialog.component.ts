import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { PersonOption } from '../../data/accounting.models';
import { PersonSearchComponent } from '../../contributions/components/person-search.component';
import { VowPledgeRow, VowTypeOption } from '../data/vows.models';
import { VowsRepository } from '../data/vows.repository';

/** "Nueva promesa": person, amount > 0, date (not after today) and notes. */
@Component({
  selector: 'app-new-vow-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, PersonSearchComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" title="Nueva promesa de voto">
      <form id="new-vow-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="text-muted text-small">{{ scopeLabel() }}</p>
        <div class="field">
          <app-person-search
            inputId="new-vow-person"
            label="Persona"
            [search]="searchPersons"
            [invalid]="submitted() && !person()"
            [(selected)]="person"
          />
          @if (submitted() && !person()) {
            <span class="field__error">Selecciona la persona que hace la promesa.</span>
          }
        </div>
        <div class="field">
          <label for="new-vow-type">Tipo de aporte</label>
          <select id="new-vow-type" class="select" formControlName="contributionTypeId">
            @for (type of vowTypes(); track type.id) {
              <option [ngValue]="type.id">{{ type.name }}</option>
            }
          </select>
          @if (vowTypes().length === 0) {
            <span class="field__error">No hay tipos de aporte Voto activos. Configúralos en Configuración contable.</span>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="new-vow-amount">Valor prometido (COP) *</label>
            <input id="new-vow-amount" class="input mono" type="number" inputmode="numeric" min="1" step="1" formControlName="pledgedAmount" aria-describedby="new-vow-amount-help" />
            <span id="new-vow-amount-help" class="field__hint">En pesos colombianos, mayor a $ 0.</span>
            @if (form.controls.pledgedAmount.touched && form.controls.pledgedAmount.invalid) {
              <span class="field__error">Escribe un valor mayor que cero.</span>
            }
          </div>
          <div class="field">
            <label for="new-vow-date">Fecha de promesa *</label>
            <input id="new-vow-date" class="input" type="date" formControlName="pledgedOn" [attr.max]="today()" />
            @if (form.controls.pledgedOn.touched && form.controls.pledgedOn.invalid) {
              <span class="field__error">Selecciona una fecha que no sea posterior a hoy.</span>
            }
          </div>
        </div>
        <div class="field">
          <label for="new-vow-notes">Observaciones</label>
          <textarea id="new-vow-notes" class="textarea" rows="3" maxlength="255" formControlName="description" placeholder="Ej.: Voto para la construcción del templo, abonos mensuales."></textarea>
        </div>
        <p class="text-muted text-small">
          La promesa queda activa hasta completar su valor. Los abonos se registran en Aportes con el tipo Voto.
        </p>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="new-vow-form" class="btn btn--primary" [disabled]="pending() || vowTypes().length === 0">
          {{ pending() ? 'Guardando…' : 'Guardar promesa' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class NewVowDialogComponent {
  private readonly repository = inject(VowsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly vowTypes = input.required<readonly VowTypeOption[]>();
  readonly today = input.required<string>();
  readonly scopeLabel = input('');
  readonly created = output<VowPledgeRow>();

  protected readonly searchPersons = (query: string) => this.repository.searchPersons(query);
  protected readonly person = signal<PersonOption | null>(null);
  protected readonly submitted = signal(false);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    contributionTypeId: this.fb.control<number | null>(null, Validators.required),
    pledgedAmount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    pledgedOn: ['', [Validators.required, (control: AbstractControl<string>) => this.notAfterToday(control)]],
    description: ['', Validators.maxLength(255)],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    const person = this.person();
    if (this.form.invalid || !person || value.contributionTypeId === null || value.pledgedAmount === null || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const row = await firstValueFrom(
        this.repository.create({
          personId: person.id,
          contributionTypeId: value.contributionTypeId,
          pledgedAmount: Number(value.pledgedAmount),
          pledgedOn: value.pledgedOn,
          description: value.description.trim() || null,
        }),
      );
      this.created.emit(row);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private notAfterToday(control: AbstractControl<string>): ValidationErrors | null {
    return control.value && control.value > this.today() ? { future: true } : null;
  }

  private reset(): void {
    this.submitted.set(false);
    this.error.set(null);
    this.person.set(null);
    this.form.reset({
      contributionTypeId: this.vowTypes()[0]?.id ?? null,
      pledgedAmount: null,
      pledgedOn: this.today(),
      description: '',
    });
  }
}
