import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { switchMap, timer } from 'rxjs';
import { CatalogsRepository } from '../../../../core/catalogs/catalogs.repository';
import { userMessage } from '../../../../core/errors/domain-error';
import { Municipality, NO_MUNICIPALITIES_MESSAGE } from '../../../../core/models/catalogs';
import { IconComponent } from '../../../../shared/ui/icon.component';

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 15;

export interface MunicipalityPicked {
  readonly code: string;
  readonly label: string;
}

let nextId = 0;

/**
 * Searchable municipality field backed by the API catalog: type a few letters and pick one result. The
 * form keeps the code; the parent keeps the label to show it when the field is set. With `countryId` and
 * `regionCode` the search only covers that country/region, and a country without municipalities shows a
 * note instead of the search.
 */
@Component({
  selector: 'app-municipality-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    @use 'tokens' as *;

    :host {
      display: block;
    }

    .search {
      position: relative;
    }

    .unavailable {
      display: flex;
      flex-direction: column;
      gap: $space-1;
    }

    .picked {
      display: flex;
      align-items: center;
      gap: $space-2;
      min-height: $control-height;
      padding: 0 $space-2 0 $space-3;
      border: 1px solid $color-primary;
      border-radius: $radius-control;
      background: $color-primary-soft;
      color: $color-primary-strong;

      &__label {
        flex: 1;
        min-width: 0;
        font-weight: $font-weight-semibold;
        overflow-wrap: anywhere;
      }
    }

    .results {
      position: absolute;
      z-index: 5;
      top: calc(100% + #{$space-1});
      right: 0;
      left: 0;
      max-height: 15rem;
      margin: 0;
      padding: $space-1;
      overflow-y: auto;
      border: 1px solid $color-border;
      border-radius: $radius-control;
      background: $color-surface;
      box-shadow: $shadow-overlay;
      list-style: none;

      &__option {
        display: flex;
        flex-direction: column;
        padding: $space-2 $space-3;
        border-radius: $radius-xs;
        cursor: pointer;

        &:hover,
        &[aria-selected='true'] {
          background: $color-primary-soft;
        }
      }

      &__note {
        padding: $space-2 $space-3;
        color: $color-ink-muted;
        font-size: $font-size-sm;

        &--error {
          color: $color-danger;
        }
      }
    }
  `,
  template: `
    @if (code()) {
      <div class="picked">
        <app-icon name="home" [size]="16" />
        <span class="picked__label">{{ label() || code() }}</span>
        <button type="button" class="btn btn--ghost btn--sm" (click)="clear()">Cambiar</button>
      </div>
    } @else if (note(); as message) {
      <div class="unavailable">
        <input
          class="input"
          type="text"
          disabled
          placeholder="Escribe el nombre del municipio"
          [id]="inputId()"
          [attr.aria-describedby]="noteId"
        />
        <span class="field__hint" role="status" [id]="noteId">{{ message }}</span>
      </div>
    } @else {
      <div class="search">
        <input
          #searchInput
          class="input"
          type="search"
          role="combobox"
          autocomplete="off"
          placeholder="Escribe el nombre del municipio"
          [id]="inputId()"
          [value]="query()"
          [attr.aria-expanded]="showList()"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeId()"
          [attr.aria-invalid]="invalid() ? 'true' : null"
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
export class MunicipalitySelectComponent {
  /** DIVIPOLA code currently chosen ('' when none). */
  readonly code = input('');
  /** Text to show for the chosen code, e.g. "Cartagena de Indias (Bolívar)". */
  readonly label = input('');
  readonly inputId = input('municipality-search');
  readonly invalid = input(false);
  /** Country the search is limited to; `null` searches every country. */
  readonly countryId = input<number | null>(null);
  /** Region (departamento/estado) the search is limited to; `null` or `''` searches every region. */
  readonly regionCode = input<string | null>(null);
  /**
   * Whether the country has municipalities, when the parent already knows it (from GET /geo/countries).
   * `null`: the component asks the API with a one-result search of the country.
   */
  readonly available = input<boolean | null>(null);
  /** Shown instead of the search while a prerequisite is missing, e.g. "Elige primero el país." */
  readonly blockedText = input<string | null>(null);
  readonly picked = output<MunicipalityPicked>();
  /** Full municipality row chosen by the user, including its `regionCode` and `regionName`. */
  readonly municipalityPicked = output<Municipality>();
  readonly cleared = output<void>();
  /** False once it is known that the country has no municipality to pick. */
  readonly availabilityChange = output<boolean>();

  private readonly catalogs = inject(CatalogsRepository);
  private readonly injector = inject(Injector);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly instance = nextId++;
  protected readonly listId = `municipality-select-list-${this.instance}`;
  protected readonly noteId = `municipality-select-note-${this.instance}`;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);

  /** Normalized region code when a department/state is selected; `null` otherwise. */
  private readonly normalizedRegionCode = computed(() => {
    const value = this.regionCode()?.trim();
    return value ? value : null;
  });

  /** One-result search that tells whether the country has municipalities at all. */
  private readonly probe = rxResource({
    params: () => {
      const countryId = this.countryId();
      return countryId !== null && this.available() === null ? { countryId } : undefined;
    },
    stream: ({ params }) => this.catalogs.searchMunicipalities({ search: '', limit: 1, countryId: params.countryId }),
  });
  private readonly hasMunicipalities = computed(() => {
    const known = this.available();
    if (known !== null) {
      return known;
    }
    return this.probe.hasValue() ? this.probe.value().length > 0 : true;
  });
  protected readonly note = computed(
    () => this.blockedText() ?? (this.hasMunicipalities() ? null : NO_MUNICIPALITIES_MESSAGE),
  );

  /**
   * When a department/state (`regionCode`) is selected and the combobox is open, list its municipalities
   * immediately (even before typing 2 letters) and filter as the user types. Without a region, wait for
   * at least 2 letters (`MIN_SEARCH_LENGTH`).
   */
  private readonly canSearch = computed(() => {
    const text = this.query().trim();
    if (text.length >= MIN_SEARCH_LENGTH) {
      return true;
    }
    return this.normalizedRegionCode() !== null && this.open();
  });

  protected readonly results = rxResource({
    params: () =>
      this.canSearch()
        ? {
            text: this.query().trim(),
            countryId: this.countryId(),
            regionCode: this.normalizedRegionCode(),
          }
        : undefined,
    // A new query unsubscribes the previous one, so the timer debounces the typing.
    stream: ({ params }) =>
      timer(params.text.length === 0 ? 0 : DEBOUNCE_MS).pipe(
        switchMap(() =>
          this.catalogs.searchMunicipalities({
            search: params.text,
            limit: RESULT_LIMIT,
            ...(params.countryId === null ? {} : { countryId: params.countryId }),
            ...(params.regionCode === null ? {} : { regionCode: params.regionCode }),
          }),
        ),
      ),
  });

  constructor() {
    effect(() => {
      const available = this.hasMunicipalities();
      untracked(() => this.availabilityChange.emit(available));
    });
  }

  protected readonly options = computed<readonly Municipality[]>(() =>
    this.results.hasValue() ? this.results.value() : [],
  );
  protected readonly showList = computed(() => this.open() && this.canSearch());
  protected readonly errorMessage = computed(() => userMessage(this.results.error()));
  protected readonly activeId = computed(() =>
    this.showList() && this.options().length > 0 ? this.optionId(this.activeIndex()) : null,
  );

  /** Moves focus to the search input once it is rendered in the DOM. */
  focusInput(): void {
    const apply = () => this.searchInput()?.nativeElement.focus();
    apply();
    queueMicrotask(apply);
    afterNextRender(apply, { injector: this.injector });
  }

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

  protected choose(option: Municipality, event: Event): void {
    // Enter must not submit the form and mousedown must not blur the input before the click lands.
    event.preventDefault();
    this.picked.emit({ code: option.code, label: `${option.name} (${option.regionName})` });
    this.municipalityPicked.emit(option);
    this.query.set('');
    this.open.set(false);
  }

  protected clear(): void {
    this.cleared.emit();
    this.query.set('');
    this.focusInput();
  }
}
