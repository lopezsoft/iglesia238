import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { DemoAccountsRepository } from '../data/demo-accounts.repository';

/** "Modo demostración": the fictional accounts a visitor can try, one per role. */
@Component({
  selector: 'app-demo-accounts-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadingComponent, ErrorBannerComponent],
  styleUrl: './demo-accounts-panel.component.scss',
  template: `
    <section class="card demo-panel" aria-labelledby="demo-title">
      <div class="demo-panel__header">
        <h2 id="demo-title">Modo demostración</h2>
        <span class="badge badge--info">Prototipo</span>
      </div>
      <p class="text-muted text-small">
        Entra como uno de estos usuarios para ver el menú y los permisos de cada rol.
      </p>

      @if (directory.isLoading()) {
        <app-loading label="Cargando usuarios de demostración…" />
      } @else if (directory.error()) {
        <app-error-banner [message]="errorMessage()" (retry)="directory.reload()" />
      } @else if (directory.value(); as value) {
        <p class="demo-panel__password text-small">
          Contraseña de todas las cuentas: <code class="chip chip--mono">{{ value.password }}</code>
        </p>
        <ul class="demo-panel__list">
          @for (account of value.accounts; track account.email) {
            <li class="demo-panel__item">
              <span class="demo-panel__avatar" aria-hidden="true">{{ account.initials }}</span>
              <span class="demo-panel__who">
                <span class="demo-panel__name">{{ account.displayName }}</span>
                @for (role of account.roles; track $index) {
                  <span class="demo-panel__role text-muted text-small">
                    {{ role.roleName }} · {{ role.scopeLabel }}
                    <span class="mono">{{ role.roleCode }}</span>
                  </span>
                }
              </span>
              <button
                type="button"
                class="btn btn--secondary btn--sm"
                [attr.aria-label]="'Usar la cuenta de ' + account.displayName"
                (click)="use.emit(account.email)"
              >
                Usar
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class DemoAccountsPanelComponent {
  private readonly repository = inject(DemoAccountsRepository);

  /** Emits the email of the chosen account. */
  readonly use = output<string>();

  protected readonly directory = rxResource({ stream: () => this.repository.getDirectory() });

  protected readonly errorMessage = computed(() => userMessage(this.directory.error()));
}
