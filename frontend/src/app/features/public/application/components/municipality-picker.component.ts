import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { startWith, switchMap, timer } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { NO_MUNICIPALITIES_MESSAGE } from '../../../../core/models/catalogs';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { MunicipalityOption, municipalityOptionLabel } from '../data/public-application.models';
import { PublicApplicationRepository } from '../data/public-application.repository';

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Searchable municipality field: the applicant types a few letters and picks one result. The form keeps
 * the code; the label travels in a second control so the summary can show it. With `countryId` (and optionally
 * `regionCode`) the search only covers that country/region, and a country without municipalities shows a note.
 */
@Component({
  selector: 'app-municipality-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styleUrl: './municipality-picker.component.scss',
  template: `
    @if (selectedCode()) {
      <div class="picked">
        <app-icon name="home" [size]="16" />
        <span class="picked__label">{{ selectedLabel() }}</span>
        <button type="button" class="btn btn--ghost btn--sm" (click)="clear()">Cambiar</button>
      </div>
    } @else if (unavailable()) {
      <div class="unavailable">
        <input
          class="input"
          type="text"
          disabled
          placeholder="Escribe el nombre de tu municipio"
          [id]="inputId()"
          [attr.aria-describedby]="noteId"
        />
        <span class="field__hint" role="status" [id]="noteId">{{ noMunicipalities }}</span>
      </div>
    } @else {
      <div class="search">
        <input
          #searchInput
          class="input"
          type="search"
          role="combobox"
          autocomplete="off"
          [placeholder]="awaitingRegion() ? 'Selecciona primero el departamento o estado' : 'Escribe el nombre de tu municipio'"
          [disabled]="awaitingRegion()"
          [id]="inputId()"
          [value]="query()"
          [attr.aria-expanded]="showList()"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeId()"
          [attr.aria-invalid]="invalid() ? 'true' : null"
          [attr.aria-describedby]="describedBy()"
          aria-autocomplete="list"
          (input)="onInput($event)"
          (keydown.arrowdown)="move($event, 1)"
          (keydown.arrowup)="move($event, -1)"
          (keydown.enter)="chooseActive($event)"
          (keydown.escape)="open.set(false)"
          (focus)="open.set(true)"
          (blur)="onBlur()"
        />
        @if (showList()) {
          <ul class="results" role="listbox" [id]="listId" aria-label="Municipios encontrados">
            @if (results.isLoading()) {
              <li class="results__note" role="presentation">Buscando…</li>
            } @else if (results.error()) {
              <li class="results__note results__note--error" role="presentation">{{ errorMessage() }}</li>
            } @else {
              @for (option of options(); track option.code; let index = $index) {
                <li
                  role="option"
                  class="results__option"
                  [id]="optionId(index)"
                  [attr.aria-selected]="index === activeIndex()"
                  (mousedown)="choose(option, $event)"
                >
                  <span>{{ option.name }}</span>
                  <span class="text-muted text-small">{{ option.regionName }}</span>
                </li>
              } @empty {
                <li class="results__note" role="presentation">No encontramos municipios con ese nombre.</li>
              }
            }
          </ul>
        }
      </div>
    }
  `,
})
export class MunicipalityPickerComponent {
  readonly codeControl = input.required<FormControl<string>>();
  readonly nameControl = input.required<FormControl<string>>();
  readonly inputId = input('municipality-search');
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  /** Country the search is limited to; `null` (the member application) searches every country. */
  readonly countryId = input<number | null>(null);
  /** Department or state code within the country; `null` searches all regions of the country. */
  readonly regionCode = input<string | null>(null);
  /** When true, the search input stays disabled until `regionCode` is selected. */
  readonly requireRegion = input(false);
  /** False once it is known that the country has no municipality to pick. */
  readonly availabilityChange = output<boolean>();

  private readonly repository = inject(PublicApplicationRepository);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly instance = Math.random().toString(36).slice(2, 8);
  protected readonly listId = `${this.instance}-municipality-list`;
  protected readonly noteId = `${this.instance}-municipality-note`;
  protected readonly noMunicipalities = NO_MUNICIPALITIES_MESSAGE;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly awaitingRegion = computed(() => this.requireRegion() && !this.regionCode());

  protected readonly selectedCode = toSignal(
    toObservable(this.codeControl).pipe(switchMap((control) => control.valueChanges.pipe(startWith(control.value)))),
    { initialValue: '' },
  );
  protected readonly selectedLabel = toSignal(
    toObservable(this.nameControl).pipe(switchMap((control) => control.valueChanges.pipe(startWith(control.value)))),
    { initialValue: '' },
  );

  /** One-result search that tells whether the country has municipalities at all. */
  private readonly probe = rxResource({
    params: () => {
      const countryId = this.countryId();
      return countryId === null ? undefined : { countryId };
    },
    stream: ({ params }) => this.repository.searchMunicipalities('', { limit: 1, countryId: params.countryId }),
  });
  protected readonly unavailable = computed(() => this.probe.hasValue() && this.probe.value().length === 0);

  protected readonly results = rxResource({
    params: () =>
      !this.awaitingRegion() && this.query().trim().length >= MIN_SEARCH_LENGTH
        ? { text: this.query().trim(), countryId: this.countryId(), regionCode: this.regionCode() }
        : undefined,
    // A new query unsubscribes the previous one, so the timer debounces the typing.
    stream: ({ params }) =>
      timer(DEBOUNCE_MS).pipe(
        switchMap(() => {
          if (params.countryId === null && !params.regionCode) {
            return this.repository.searchMunicipalities(params.text);
          }
          return this.repository.searchMunicipalities(params.text, {
            ...(params.countryId !== null ? { countryId: params.countryId } : {}),
            ...(params.regionCode ? { regionCode: params.regionCode } : {}),
          });
        }),
      ),
  });

  constructor() {
    effect(() => {
      const available = !this.unavailable();
      untracked(() => this.availabilityChange.emit(available));
    });
  }

  protected readonly options = computed<readonly MunicipalityOption[]>(() =>
    this.results.hasValue() ? this.results.value() : [],
  );
  protected readonly showList = computed(() => this.open() && this.query().trim().length >= MIN_SEARCH_LENGTH);
  protected readonly errorMessage = computed(() => userMessage(this.results.error()));
  protected readonly activeId = computed(() =>
    this.showList() && this.options().length > 0 ? this.optionId(this.activeIndex()) : null,
  );

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  protected onBlur(): void {
    this.open.set(false);
    this.codeControl().markAsTouched();
  }

  protected move(event: Event, delta: number): void {
    const count = this.options().length;
    if (count === 0) {
      return;
    }
    event.preventDefault();
    this.open.set(true);
    this.activeIndex.update((index) => (index + delta + count) % count);
  }

  protected chooseActive(event: Event): void {
    const option = this.options()[this.activeIndex()];
    if (this.showList() && option) {
      this.choose(option, event);
    }
  }

  protected choose(option: MunicipalityOption, event: Event): void {
    // Enter must not submit the form and mousedown must not blur the input before the click lands.
    event.preventDefault();
    this.codeControl().setValue(option.code);
    this.nameControl().setValue(municipalityOptionLabel(option));
    this.codeControl().markAsTouched();
    this.query.set('');
    this.open.set(false);
  }

  protected clear(): void {
    this.codeControl().setValue('');
    this.nameControl().setValue('');
    this.query.set('');
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }
}
