import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { switchMap, timer } from 'rxjs';
import { CatalogsRepository } from '../../../../core/catalogs/catalogs.repository';
import { userMessage } from '../../../../core/errors/domain-error';
import { Municipality } from '../../../../core/models/catalogs';
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
 * Searchable municipality field backed by the real catalog (DIVIPOLA): type a few letters and pick
 * one result. The form keeps the code; the parent keeps the label to show it when the field is set.
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
  readonly picked = output<MunicipalityPicked>();
  readonly cleared = output<void>();

  private readonly catalogs = inject(CatalogsRepository);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly listId = `municipality-select-list-${nextId++}`;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);

  protected readonly results = rxResource({
    params: () => (this.query().trim().length >= MIN_SEARCH_LENGTH ? { text: this.query().trim() } : undefined),
    // A new query unsubscribes the previous one, so the timer debounces the typing.
    stream: ({ params }) =>
      timer(DEBOUNCE_MS).pipe(
        switchMap(() => this.catalogs.searchMunicipalities({ search: params.text, limit: RESULT_LIMIT })),
      ),
  });

  protected readonly options = computed<readonly Municipality[]>(() =>
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
    this.query.set('');
    this.open.set(false);
  }

  protected clear(): void {
    this.cleared.emit();
    this.query.set('');
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }
}
