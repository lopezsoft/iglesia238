import { ChangeDetectionStrategy, Component, effect, inject, input, model, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs';
import { DialogComponent } from '../../../shared/ui/dialog.component';
import {
  POLICY_CONTENT_MAX_LENGTH,
  POLICY_CONTENT_MIN_LENGTH,
  POLICY_VERSION_MAX_LENGTH,
  PrivacyPolicy,
  PrivacyPolicyDraft,
  todayIso,
} from '../data/privacy-policy.models';

/** Create or edit a draft policy. The page runs the command and reports a failure in `error`. */
@Component({
  selector: 'app-policy-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DialogComponent],
  styles: `
    @use 'tokens' as *;

    .policy-form {
      display: flex;
      flex-direction: column;
      gap: $space-4;
    }

    .policy-form__text {
      min-height: 16rem;
      font-family: inherit;
      line-height: $line-height;
    }
  `,
  template: `
    <app-dialog [(open)]="open" [title]="policy() ? 'Editar borrador' : 'Nueva versión de la política'" variant="wide">
      <form id="policy-form" class="policy-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="form-grid">
          <div class="field">
            <label for="policy-version">Versión *</label>
            <input
              id="policy-version"
              class="input"
              type="text"
              formControlName="version"
              autocomplete="off"
              [attr.maxlength]="versionMax"
              [attr.aria-invalid]="invalid('version') ? 'true' : null"
              aria-describedby="policy-version-hint"
            />
            <p id="policy-version-hint" class="field__hint">Por ejemplo 1.0 o 2026-1. Debe ser única.</p>
            @if (invalid('version')) {
              <p class="field__error" role="alert">Escribe la versión (máximo {{ versionMax }} caracteres).</p>
            }
          </div>
          <div class="field">
            <label for="policy-effective">Rige desde *</label>
            <input
              id="policy-effective"
              class="input"
              type="date"
              formControlName="effectiveFrom"
              [attr.aria-invalid]="invalid('effectiveFrom') ? 'true' : null"
              aria-describedby="policy-effective-hint"
            />
            <p id="policy-effective-hint" class="field__hint">
              Al publicar, una fecha que ya pasó se cambia a hoy.
            </p>
            @if (invalid('effectiveFrom')) {
              <p class="field__error" role="alert">Indica la fecha de vigencia.</p>
            }
          </div>
        </div>
        <div class="field">
          <label for="policy-content">Texto de la política *</label>
          <textarea
            id="policy-content"
            class="textarea policy-form__text"
            formControlName="content"
            [attr.maxlength]="contentMax"
            [attr.aria-invalid]="invalid('content') ? 'true' : null"
            aria-describedby="policy-content-hint"
          ></textarea>
          <p id="policy-content-hint" class="field__hint">
            Es el texto que el solicitante lee y acepta (responsable del tratamiento, finalidades,
            derechos del titular, canales de consulta). {{ length() }}/{{ contentMax }} caracteres.
          </p>
          @if (invalid('content')) {
            <p class="field__error" role="alert">
              El texto debe tener entre {{ contentMin }} y {{ contentMax }} caracteres.
            </p>
          }
        </div>
        @if (error(); as message) {
          <p class="alert alert--danger" role="alert">{{ message }}</p>
        }
      </form>
      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" [disabled]="pending()" (click)="open.set(false)">
          Cancelar
        </button>
        <button type="submit" form="policy-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : 'Guardar borrador' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class PolicyFormDialogComponent {
  readonly open = model(false);
  /** Draft being edited; null creates a new one. */
  readonly policy = input<PrivacyPolicy | null>(null);
  readonly suggestedVersion = input('1.0');
  readonly pending = input(false);
  readonly error = input<string | null>(null);
  readonly saved = output<PrivacyPolicyDraft>();

  protected readonly versionMax = POLICY_VERSION_MAX_LENGTH;
  protected readonly contentMin = POLICY_CONTENT_MIN_LENGTH;
  protected readonly contentMax = POLICY_CONTENT_MAX_LENGTH;

  protected readonly form = inject(NonNullableFormBuilder).group({
    version: ['', [Validators.required, Validators.maxLength(POLICY_VERSION_MAX_LENGTH)]],
    effectiveFrom: ['', Validators.required],
    content: [
      '',
      [
        Validators.required,
        Validators.minLength(POLICY_CONTENT_MIN_LENGTH),
        Validators.maxLength(POLICY_CONTENT_MAX_LENGTH),
      ],
    ],
  });

  private readonly submitted = signal(false);
  protected readonly length = toSignal(
    this.form.controls.content.valueChanges.pipe(
      startWith(this.form.controls.content.value),
      map((value) => value.trim().length),
    ),
    { initialValue: 0 },
  );
  protected readonly invalid = (name: 'version' | 'effectiveFrom' | 'content'): boolean => {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  };

  constructor() {
    // Each time the dialog opens it starts from the draft being edited, or from a blank one.
    effect(() => {
      if (!this.open()) {
        return;
      }
      const policy = this.policy();
      this.submitted.set(false);
      this.form.reset({
        version: policy?.version ?? this.suggestedVersion(),
        effectiveFrom: policy?.effectiveFrom ?? todayIso(),
        content: policy?.content ?? '',
      });
    });
  }

  protected submit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    const { version, effectiveFrom, content } = this.form.getRawValue();
    this.saved.emit({ version: version.trim(), effectiveFrom, content: content.trim() });
  }
}
