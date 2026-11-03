import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PersonEligibility, PersonOption, PersonSummary } from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { debounced } from './debounced';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const RESULT_LIMIT = 8;

let nextId = 0;

/**
 * Picks a person of the denomination by name, document or member code. The search runs on the
 * server (nobody downloads the whole list) and documents come back masked. Use it with
 * `formControlName`: the value is the chosen person or null.
 */
@Component({
  selector: 'app-person-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PersonPickerComponent),
      multi: true,
    },
  ],
  styleUrl: './person-picker.component.scss',
  template: `
    <div class="field">
      <label [for]="inputId">{{ label() }}{{ required() ? ' *' : '' }}</label>
      @if (selected(); as person) {
        <div class="pick">
          <span class="pick__avatar" aria-hidden="true">{{ initials(person.fullName) }}</span>
          <div class="pick__text">
            <strong>{{ person.fullName }}</strong>
            <span class="text-muted text-small">{{ detail(person) }}</span>
          </div>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            [attr.aria-label]="'Quitar ' + label().toLowerCase()"
            [disabled]="disabled()"
            (click)="clear()"
          >
            <app-icon name="x" [size]="16" />
            Quitar
          </button>
        </div>
      } @else {
        <input
          #search
          class="input"
          type="search"
          autocomplete="off"
          [placeholder]="placeholder()"
          [id]="inputId"
          [value]="query()"
          [disabled]="disabled()"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="error() ? 'true' : null"
          (input)="query.set(search.value)"
          (blur)="touch()"
        />
        @if (results.isLoading()) {
          <p class="text-muted text-small" role="status">Buscando…</p>
        } @else if (results.error()) {
          <p class="field__error" role="alert">{{ errorMessage() }}</p>
        } @else if (results.hasValue() && searchable()) {
          @if (visible().length > 0) {
            <ul class="results" aria-label="Resultados de la búsqueda">
              @for (person of visible(); track person.id) {
                <li>
                  <button type="button" (click)="pick(person)">
                    <span>{{ person.fullName }}</span>
                    <span class="text-muted text-small">{{ detail(person) }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="text-muted text-small" role="status">
              Sin resultados para «{{ debouncedQuery() }}». Verifica el nombre o el documento.
            </p>
          }
        }
      }
      @if (error(); as message) {
        <p class="field__error" [id]="inputId + '-error'" role="alert">{{ message }}</p>
      } @else if (hint()) {
        <p class="field__hint" [id]="inputId + '-hint'">{{ hint() }}</p>
      }
    </div>
  `,
})
export class PersonPickerComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly eligibleFor = input<PersonEligibility | undefined>(undefined);
  readonly placeholder = input('Nombre, documento o código de miembro');
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly required = input(false);
  /** Ids the person cannot pick (the other spouse, the child as their own parent). */
  readonly exclude = input<readonly number[]>([]);

  private readonly repository = inject(RecordsRepository);
  private readonly auth = inject(AuthService);

  protected readonly inputId = `person-picker-${nextId++}`;
  protected readonly selected = signal<PersonSummary | null>(null);
  protected readonly disabled = signal(false);
  protected readonly query = signal('');
  protected readonly debouncedQuery = debounced(this.query, SEARCH_DEBOUNCE_MS);

  protected readonly searchable = computed(
    () => this.debouncedQuery().trim().length >= MIN_QUERY_LENGTH,
  );
  protected readonly results = rxResource({
    params: () =>
      this.searchable() && !this.selected()
        ? {
            q: this.debouncedQuery().trim(),
            eligibleFor: this.eligibleFor(),
            tenant: this.auth.tenant(),
          }
        : undefined,
    stream: ({ params }) =>
      this.repository.searchPeople({
        q: params.q,
        eligibleFor: params.eligibleFor,
        limit: RESULT_LIMIT,
      }),
  });
  protected readonly visible = computed<readonly PersonOption[]>(() => {
    const hidden = new Set(this.exclude());
    return (this.results.hasValue() ? this.results.value() : []).filter(
      (person) => !hidden.has(person.id),
    );
  });
  protected readonly errorMessage = computed(() => userMessage(this.results.error()));
  protected readonly describedBy = computed(() => {
    if (this.error()) {
      return `${this.inputId}-error`;
    }
    return this.hint() ? `${this.inputId}-hint` : null;
  });

  private onChange: (value: PersonSummary | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: PersonSummary | null): void {
    this.selected.set(value);
    if (value === null) {
      this.query.set('');
    }
  }

  registerOnChange(fn: (value: PersonSummary | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected pick(person: PersonOption): void {
    this.selected.set(person);
    this.query.set('');
    this.onChange(person);
    this.onTouched();
  }

  protected clear(): void {
    this.selected.set(null);
    this.query.set('');
    this.onChange(null);
    this.onTouched();
  }

  protected touch(): void {
    this.onTouched();
  }

  protected detail(person: PersonSummary): string {
    return [
      person.memberCode,
      person.maskedDocument,
      person.age === null ? null : `${person.age} años`,
    ]
      .filter((part): part is string => !!part)
      .join(' · ');
  }

  /** First name and first last name: "Ana María Rojas Díaz" → AR. */
  protected initials(fullName: string): string {
    const words = fullName.split(/\s+/).filter(Boolean);
    const last = words.length >= 3 ? words[words.length - 2] : words[words.length - 1];
    return `${words[0]?.[0] ?? ''}${words.length > 1 ? (last?.[0] ?? '') : ''}`.toUpperCase();
  }
}
