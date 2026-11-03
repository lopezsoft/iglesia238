import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { startWith, switchMap, timer } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { MunicipalityOption, municipalityOptionLabel } from '../data/public-application.models';
import { PublicApplicationRepository } from '../data/public-application.repository';

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Searchable municipality (DIVIPOLA) field: the applicant types a few letters and picks one result.
 * The form keeps the code; the label travels in a second control so the summary can show it.
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
    } @else {
      <div class="search">
        <input
          #searchInput
          class="input"
          type="search"
          role="combobox"
          autocomplete="off"
          placeholder="Escribe el nombre de tu municipio"
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

  private readonly repository = inject(PublicApplicationRepository);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly listId = `${Math.random().toString(36).slice(2, 8)}-municipality-list`;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);

  protected readonly selectedCode = toSignal(
    toObservable(this.codeControl).pipe(switchMap((control) => control.valueChanges.pipe(startWith(control.value)))),
    { initialValue: '' },
  );
  protected readonly selectedLabel = toSignal(
    toObservable(this.nameControl).pipe(switchMap((control) => control.valueChanges.pipe(startWith(control.value)))),
    { initialValue: '' },
  );

  protected readonly results = rxResource({
    params: () => (this.query().trim().length >= MIN_SEARCH_LENGTH ? { text: this.query().trim() } : undefined),
    // A new query unsubscribes the previous one, so the timer debounces the typing.
    stream: ({ params }) => timer(DEBOUNCE_MS).pipe(switchMap(() => this.repository.searchMunicipalities(params.text))),
  });

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
