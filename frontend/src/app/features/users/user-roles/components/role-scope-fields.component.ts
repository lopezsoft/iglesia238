import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ROLE_NAMES, RoleCode } from '../../../../core/auth/role';
import { GrantContext, GrantableRole, ScopeOption, findScope, scopeValue } from '../data/user-roles.models';

export type RoleScopeForm = FormGroup<{
  role: FormControl<RoleCode | ''>;
  scope: FormControl<string>;
}>;

export function createRoleScopeForm(fb: NonNullableFormBuilder): RoleScopeForm {
  return fb.group({
    role: fb.control<RoleCode | ''>('', Validators.required),
    scope: fb.control('', Validators.required),
  });
}

/** The role and scope chosen in a RoleScopeForm, or null while incomplete. */
export function selectedGrant(
  form: RoleScopeForm,
  context: GrantContext,
): { role: RoleCode; scope: ScopeOption } | null {
  const { role, scope } = form.getRawValue();
  const option = context.roles.find((item) => item.role === role);
  const selected = findScope(option, scope);
  return option && selected ? { role: option.role, scope: selected } : null;
}

/**
 * "Rol" and "Alcance" selectors. Denomination and platform roles have a single scope, so the
 * scope is preselected and locked; sede roles require choosing a sede.
 */
@Component({
  selector: 'app-role-scope-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="form-grid" [formGroup]="group()">
      <div class="field">
        <label [for]="idPrefix() + '-role'">{{ roleLabel() }} *</label>
        <select
          class="select"
          [id]="idPrefix() + '-role'"
          formControlName="role"
          [attr.aria-describedby]="context().isPlatformAdmin ? null : idPrefix() + '-role-help'"
        >
          <option value="">Selecciona un rol</option>
          @for (option of context().roles; track option.role) {
            <option [value]="option.role">{{ roleNames[option.role] }}</option>
          }
        </select>
        @if (!context().isPlatformAdmin) {
          <span class="field__hint" [id]="idPrefix() + '-role-help'">
            Administrador de plataforma no aparece: tu rol no puede otorgarlo.
          </span>
        }
        @if (group().controls.role.touched && group().controls.role.invalid) {
          <span class="field__error">Selecciona el rol.</span>
        }
      </div>
      <div class="field">
        <label [for]="idPrefix() + '-scope'">Alcance *</label>
        <select
          class="select"
          [id]="idPrefix() + '-scope'"
          formControlName="scope"
          [attr.aria-describedby]="idPrefix() + '-scope-help'"
        >
          @if (scopes().length !== 1) {
            <option value="">{{ role() ? 'Selecciona la sede' : 'Primero selecciona el rol' }}</option>
          }
          @for (scope of scopes(); track scopeKey(scope)) {
            <option [value]="scopeKey(scope)">{{ scope.label }}</option>
          }
        </select>
        <span class="field__hint" [id]="idPrefix() + '-scope-help'">
          Los roles de denominación aplican en todas sus sedes; Pastor, Secretario(a) y Tesorero(a) se asignan a una sede.
        </span>
        @if (group().controls.scope.touched && group().controls.scope.invalid) {
          <span class="field__error">Selecciona el alcance del rol.</span>
        }
      </div>
    </div>
  `,
})
export class RoleScopeFieldsComponent {
  readonly group = input.required<RoleScopeForm>();
  readonly context = input.required<GrantContext>();
  readonly idPrefix = input.required<string>();
  readonly roleLabel = input('Rol');

  protected readonly roleNames = ROLE_NAMES;
  protected readonly scopeKey = scopeValue;
  protected readonly role = signal<RoleCode | ''>('');
  private readonly roleOption = computed<GrantableRole | undefined>(() =>
    this.context().roles.find((item) => item.role === this.role()),
  );
  protected readonly scopes = computed(() => this.roleOption()?.scopes ?? []);

  constructor() {
    effect((onCleanup) => {
      const group = this.group();
      this.syncScope(group, group.controls.role.value);
      const subscription = group.controls.role.valueChanges.subscribe((role) => this.syncScope(group, role));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  private syncScope(group: RoleScopeForm, role: RoleCode | ''): void {
    this.role.set(role);
    const scopes = this.context().roles.find((item) => item.role === role)?.scopes ?? [];
    const scope = group.controls.scope;
    if (scopes.length === 1) {
      scope.setValue(scopeValue(scopes[0]), { emitEvent: false });
      scope.disable({ emitEvent: false });
      return;
    }
    if (!scopes.some((item) => scopeValue(item) === scope.value)) {
      scope.setValue('', { emitEvent: false });
    }
    if (role) {
      scope.enable({ emitEvent: false });
    } else {
      scope.disable({ emitEvent: false });
    }
  }
}
