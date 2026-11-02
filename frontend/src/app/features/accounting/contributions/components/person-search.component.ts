import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PersonOption } from '../../data/accounting.models';

interface SearchState {
  readonly loading: boolean;
  readonly results: readonly PersonOption[];
  readonly failed: boolean;
}

const IDLE: SearchState = { loading: false, results: [], failed: false };

/**
 * Person picker for accounting forms: type two characters, pick a result, "Cambiar" to undo.
 * The search itself comes from the feature port, so this component holds no data access.
 */
@Component({
  selector: 'app-person-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (selected(); as person) {
      <span class="field__label" [id]="inputId() + '-label'">{{ label() }} *</span>
      <div class="selected" [attr.aria-labelledby]="inputId() + '-label'">
        <div>
          <div class="selected__name">{{ person.fullName }}</div>
          <div class="text-muted text-small">
            <span class="mono">{{ person.memberCode }}</span> · {{ person.documentHint }} · {{ person.congregationName }}
          </div>
        </div>
        @if (!locked()) {
          <button type="button" class="btn btn--ghost btn--sm" (click)="clear()">Cambiar</button>
        }
      </div>
    } @else {
      <label [for]="inputId()">{{ label() }} *</label>
      <div class="search">
        <app-icon name="search" class="search__icon" />
        <input
          type="search"
          class="input search__input"
          autocomplete="off"
          [id]="inputId()"
          [value]="query()"
          [attr.aria-invalid]="invalid()"
          [attr.aria-describedby]="inputId() + '-help'"
          placeholder="Nombre, documento o código (SC-0148)"
          (input)="onInput($event)"
        />
      </div>
      <div aria-live="polite">
        @if (state().loading) {
          <span class="field__hint">Buscando…</span>
        } @else if (state().failed) {
          <span class="field__error">No fue posible buscar. Intenta de nuevo.</span>
        } @else if (state().results.length > 0) {
          <ul class="results" aria-label="Personas encontradas">
            @for (person of state().results; track person.id) {
              <li>
                <button type="button" class="results__item" (click)="pick(person)">
                  <span>{{ person.fullName }}</span>
                  <span class="text-muted text-small">
                    <span class="mono">{{ person.memberCode }}</span> · {{ person.documentHint }} · {{ person.congregationName }}
                  </span>
                </button>
              </li>
            }
          </ul>
        } @else if (query().trim().length >= 2) {
          <span class="field__hint">No hay miembros de la denominación con ese criterio.</span>
        }
      </div>
      <span class="field__hint" [id]="inputId() + '-help'">Escribe al menos 2 caracteres. Aparecen los miembros de la denominación, primero los de la sede.</span>
    }
  `,
  styles: `
    @use 'tokens' as *;
    :host {
      display: flex;
      flex-direction: column;
      gap: $space-1;
    }
    .search {
      position: relative;
    }
    .search__icon {
      position: absolute;
      top: 50%;
      left: $space-3;
      transform: translateY(-50%);
      color: $color-ink-muted;
    }
    .search__input {
      padding-left: $space-6 + $space-1;
    }
    .results {
      margin: $space-1 0 0;
      padding: $space-1;
      list-style: none;
      border: 1px solid $color-border;
      border-radius: $radius-control;
      background: $color-surface;
      box-shadow: $shadow-card;
    }
    .results__item {
      display: flex;
      flex-direction: column;
      width: 100%;
      padding: $space-2 $space-3;
      border: 0;
      border-radius: $radius-control;
      background: transparent;
      color: $color-ink;
      text-align: left;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        background: $color-primary-soft;
      }
    }
    .selected {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: $space-3;
      padding: $space-2 $space-3;
      border: 1px solid $color-border;
      border-radius: $radius-control;
      background: $color-surface-2;
    }
    .selected__name {
      font-weight: $font-weight-medium;
    }
  `,
})
export class PersonSearchComponent {
  readonly inputId = input.required<string>();
  readonly label = input('Persona');
  readonly search = input.required<(query: string) => Observable<PersonOption[]>>();
  readonly invalid = input(false);
  /** True keeps the selection fixed (e.g. a vow payment preselected from Votos). */
  readonly locked = input(false);
  readonly selected = model<PersonOption | null>(null);

  protected readonly query = signal('');

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      map((query) => query.trim()),
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((query) =>
        query.length < 2
          ? of(IDLE)
          : this.search()(query).pipe(
              map((results): SearchState => ({ loading: false, results, failed: false })),
              startWith<SearchState>({ loading: true, results: [], failed: false }),
              catchError(() => of<SearchState>({ loading: false, results: [], failed: true })),
            ),
      ),
    ),
    { initialValue: IDLE },
  );

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected pick(person: PersonOption): void {
    this.selected.set(person);
    this.query.set('');
  }

  protected clear(): void {
    this.selected.set(null);
  }
}
