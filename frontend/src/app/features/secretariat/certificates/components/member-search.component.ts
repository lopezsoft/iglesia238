import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { switchMap, timer } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { MemberOption } from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

/** Picks an active member of the active sede by name, member code or document number. */
@Component({
  selector: 'app-member-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent],
  styleUrl: './member-search.component.scss',
  template: `
    <div class="field">
      <label [for]="inputId()">Miembro *</label>
      @if (selected(); as member) {
        <div class="member-pick">
          <span class="member-pick__avatar" aria-hidden="true">{{
            initials(member.fullName)
          }}</span>
          <div class="member-pick__text">
            <strong>{{ member.fullName }}</strong>
            <span class="text-muted text-small">
              <span class="mono">{{ member.code }}</span>
              @if (member.documentLabel) {
                · {{ member.documentLabel }}
              }
              @if (member.joinedOn) {
                · Miembro desde {{ member.joinedOn | date: 'dd/MM/yyyy' }}
              }
            </span>
          </div>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            aria-label="Quitar miembro seleccionado"
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
          placeholder="Nombre, código o número de documento"
          [id]="inputId()"
          [value]="query()"
          [disabled]="disabled()"
          [attr.aria-describedby]="inputId() + '-help'"
          [attr.aria-invalid]="invalid()"
          (input)="query.set(search.value)"
        />
        @if (results.isLoading()) {
          <p class="text-muted text-small" role="status">Buscando…</p>
        } @else if (results.error()) {
          <p class="field__error" role="alert">{{ errorMessage() }}</p>
        } @else if (results.value(); as list) {
          @if (list.length > 0) {
            <ul class="member-results" aria-label="Resultados de la búsqueda">
              @for (member of list; track member.id) {
                <li>
                  <button type="button" (click)="pick(member)">
                    <span>{{ member.fullName }}</span>
                    <span class="text-muted text-small">
                      <span class="mono">{{ member.code }}</span>
                      @if (member.documentLabel) {
                        · {{ member.documentLabel }}
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="text-muted text-small" role="status">
              Sin resultados para «{{ query() }}». Verifica el nombre o el número de documento.
            </p>
          }
        }
      }
      @if (invalid()) {
        <p class="field__error" role="alert">Selecciona un miembro para emitir el documento.</p>
      }
      <p class="field__hint" [id]="inputId() + '-help'">{{ hint() }}</p>
    </div>
  `,
})
export class MemberSearchComponent {
  readonly selected = model<MemberOption | null>(null);
  readonly inputId = input('member-search');
  readonly hint = input.required<string>();
  readonly invalid = input(false);
  readonly disabled = input(false);

  private readonly repo = inject(CertificatesRepository);
  private readonly auth = inject(AuthService);
  protected readonly query = signal('');

  protected readonly results = rxResource({
    params: () => {
      const query = this.query().trim();
      return query.length >= MIN_QUERY_LENGTH && !this.selected()
        ? { query, tenant: this.auth.tenant() }
        : undefined;
    },
    stream: ({ params }) =>
      timer(SEARCH_DEBOUNCE_MS).pipe(switchMap(() => this.repo.searchMembers(params.query))),
  });

  protected readonly errorMessage = computed(() => userMessage(this.results.error()));

  protected pick(member: MemberOption): void {
    this.selected.set(member);
    this.query.set('');
  }

  protected clear(): void {
    this.selected.set(null);
    this.query.set('');
  }

  /** First name and first last name: "Ana María Rojas Díaz" → AR. */
  protected initials(fullName: string): string {
    const words = fullName.split(/\s+/).filter(Boolean);
    const last = words.length >= 3 ? words[words.length - 2] : words[words.length - 1];
    return `${words[0]?.[0] ?? ''}${words.length > 1 ? (last?.[0] ?? '') : ''}`.toUpperCase();
  }
}
