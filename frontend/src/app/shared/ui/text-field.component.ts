import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconComponent, IconName } from './icon.component';

let nextId = 0;

/**
 * Labeled text input for reactive forms (`formControlName`): optional leading icon, show/hide
 * button for passwords, hint and error text wired with aria attributes. Validation stays in the
 * form: pass the message to show in `error`. Extra content next to the label (a "¿La olvidaste?"
 * link) goes in `[field-aside]`.
 */
@Component({
  selector: 'app-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextFieldComponent), multi: true }],
  styleUrl: './text-field.component.scss',
  template: `
    <div class="field">
      <div class="text-field__head">
        <label class="field__label" [for]="inputId">{{ label() }}</label>
        <ng-content select="[field-aside]" />
      </div>
      <div class="input-group" [class.input-group--icon]="icon()" [class.input-group--action]="isPassword()">
        @if (icon(); as name) {
          <app-icon class="input-group__icon" [name]="name" [size]="18" />
        }
        <input
          class="input"
          [class.input--lg]="size() === 'lg'"
          [id]="inputId"
          [type]="currentType()"
          [value]="value()"
          [disabled]="disabled()"
          [placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete()"
          [attr.inputmode]="inputmode()"
          [attr.maxlength]="maxlength()"
          [attr.aria-required]="required() ? 'true' : null"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="describedBy()"
          (input)="onInput($event)"
          (blur)="touch()"
        />
        @if (isPassword()) {
          <button
            type="button"
            class="input-group__action"
            [attr.aria-label]="revealed() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            [attr.aria-pressed]="revealed()"
            (click)="revealed.set(!revealed())"
          >
            <app-icon [name]="revealed() ? 'eye-off' : 'eye'" [size]="18" />
          </button>
        }
      </div>
      @if (error(); as message) {
        <p class="field__error" [id]="errorId" role="alert">{{ message }}</p>
      } @else if (hint()) {
        <p class="field__hint" [id]="hintId">{{ hint() }}</p>
      }
    </div>
  `,
})
export class TextFieldComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'email' | 'password' | 'tel' | 'search'>('text');
  readonly icon = input<IconName | null>(null);
  readonly placeholder = input('');
  readonly autocomplete = input<string | null>(null);
  readonly inputmode = input<string | null>(null);
  readonly maxlength = input<number | null>(null);
  readonly hint = input<string | null>(null);
  /** Message to show; the field is marked invalid while it is set. */
  readonly error = input<string | null>(null);
  readonly required = input(false);
  readonly size = input<'md' | 'lg'>('md');

  protected readonly inputId = `app-text-field-${nextId++}`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly hintId = `${this.inputId}-hint`;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly revealed = signal(false);
  protected readonly isPassword = computed(() => this.type() === 'password');
  protected readonly currentType = computed(() =>
    this.isPassword() && this.revealed() ? 'text' : this.type(),
  );
  protected readonly describedBy = computed(() => {
    if (this.error()) {
      return this.errorId;
    }
    return this.hint() ? this.hintId : null;
  });

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  protected touch(): void {
    this.onTouched();
  }
}
