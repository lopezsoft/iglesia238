import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { ACCOUNT_NATURE_LABELS } from '../../data/accounting.models';
import { AccountRow } from '../data/accounting-setup.models';

/** Chart of accounts as a tree table with expand / collapse per group. */
@Component({
  selector: 'app-accounts-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, StatusBadgeComponent],
  template: `
    <section class="card card--flush" aria-labelledby="accounts-title">
      <div class="card__header tree-header">
        <div>
          <h2 id="accounts-title">Plan de cuentas</h2>
          <p class="text-muted text-small">
            {{ accounts().length }} cuentas · {{ postableCount() }} imputables · estructura compartida por la denominación
          </p>
        </div>
        <div class="cluster">
          <button type="button" class="btn btn--ghost btn--sm" (click)="collapsed.set([])">Expandir todo</button>
          <button type="button" class="btn btn--ghost btn--sm" (click)="collapseAll()">Contraer todo</button>
        </div>
      </div>
      <div class="alert tree-alert" role="note">
        <app-icon name="info" />
        <span>Solo las cuentas imputables reciben movimientos. Las cuentas que agrupan subcuentas no son imputables.</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Nombre</th>
              <th scope="col">Naturaleza</th>
              <th scope="col">Imputable</th>
              <th scope="col">Fondo sugerido</th>
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of visibleRows(); track row.id) {
              <tr>
                <td class="code">
                  <div class="tree-cell" [attr.data-depth]="row.depth">
                    @if (row.hasChildren) {
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon btn--sm"
                        [attr.aria-expanded]="!isCollapsed(row.id)"
                        [attr.aria-label]="(isCollapsed(row.id) ? 'Expandir ' : 'Contraer ') + row.code + ' ' + row.name"
                        (click)="toggle(row.id)"
                      >
                        <app-icon [name]="isCollapsed(row.id) ? 'chevron-right' : 'chevron-down'" [size]="16" />
                      </button>
                    } @else {
                      <span class="tree-spacer" aria-hidden="true"></span>
                    }
                    <span [class.tree-group]="row.hasChildren">{{ row.code }}</span>
                  </div>
                </td>
                <td [class.tree-group]="row.hasChildren">{{ row.name }}</td>
                <td>{{ natureLabels[row.nature] }}</td>
                <td>
                  <app-status-badge [label]="row.isPostable ? 'Sí' : 'No, agrupa'" [tone]="row.isPostable ? 'success' : 'neutral'" />
                </td>
                <td class="text-muted">{{ row.defaultFundName ?? '—' }}</td>
                <td>
                  @if (canManage()) {
                    <div class="cluster row-actions">
                      <button type="button" class="btn btn--ghost btn--sm" [attr.aria-label]="'Nueva subcuenta de ' + row.code" (click)="addChild.emit(row)">
                        <app-icon name="plus" [size]="16" /> Subcuenta
                      </button>
                      <button type="button" class="btn btn--secondary btn--sm" [attr.aria-label]="'Editar cuenta ' + row.code" (click)="edit.emit(row)">
                        Editar
                      </button>
                      <button
                        type="button"
                        class="btn btn--danger-ghost btn--sm"
                        [disabled]="!!deleteBlocker(row)"
                        [attr.title]="deleteBlocker(row)"
                        [attr.aria-label]="'Eliminar cuenta ' + row.code"
                        (click)="remove.emit(row)"
                      >
                        Eliminar
                      </button>
                    </div>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="cluster tree-footer text-muted text-small">
        <span>{{ visibleRows().length }} de {{ accounts().length }} cuentas visibles</span>
        <span>Clase 4: Ingresos · Clase 5: Egresos</span>
      </div>
    </section>
  `,
  styles: `
    @use 'tokens' as *;
    .tree-header {
      padding: $space-5 $space-5 0;
    }
    .tree-alert {
      margin: 0 $space-5 $space-4;
    }
    .tree-cell {
      display: flex;
      align-items: center;
      gap: $space-1;
      @for $depth from 1 through 6 {
        &[data-depth='#{$depth}'] {
          padding-left: $space-5 * $depth;
        }
      }
    }
    .tree-spacer {
      display: inline-block;
      width: 2rem;
    }
    .tree-group {
      font-weight: $font-weight-semibold;
    }
    .row-actions {
      justify-content: flex-end;
      flex-wrap: nowrap;
    }
    .tree-footer {
      justify-content: space-between;
      padding: $space-3 $space-5;
    }
  `,
})
export class AccountsTreeComponent {
  readonly accounts = input.required<readonly AccountRow[]>();
  readonly canManage = input(false);
  readonly edit = output<AccountRow>();
  readonly remove = output<AccountRow>();
  readonly addChild = output<AccountRow>();

  protected readonly natureLabels = ACCOUNT_NATURE_LABELS;
  protected readonly collapsed = signal<readonly number[]>([]);
  protected readonly postableCount = computed(() => this.accounts().filter((a) => a.isPostable).length);

  /** Rows whose ancestors are all expanded. */
  protected readonly visibleRows = computed(() => {
    const collapsed = new Set(this.collapsed());
    const byId = new Map(this.accounts().map((a) => [a.id, a]));
    return this.accounts().filter((account) => {
      let parentId = account.parentId;
      while (parentId !== null) {
        if (collapsed.has(parentId)) {
          return false;
        }
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  });

  protected isCollapsed(id: number): boolean {
    return this.collapsed().includes(id);
  }

  protected toggle(id: number): void {
    this.collapsed.update((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  protected collapseAll(): void {
    this.collapsed.set(this.accounts().filter((a) => a.hasChildren).map((a) => a.id));
  }

  /** Why an account cannot be deleted (shown as the button title), or null. */
  protected deleteBlocker(row: AccountRow): string | null {
    if (row.hasChildren) {
      return 'Tiene subcuentas';
    }
    if (row.hasMovements) {
      return 'Tiene movimientos o presupuesto';
    }
    if (row.linkedTypes > 0) {
      return 'Está asociada a un tipo de aporte';
    }
    return null;
  }
}
