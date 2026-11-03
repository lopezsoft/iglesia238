import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { ApplicationStatusCheck, PublicApplicationStatus } from '../../application/data/public-application.models';
import { PublicApplicationRepository } from '../../application/data/public-application.repository';
import { TRACKING_CODE_EXAMPLE, normalizeTrackingCode } from '../../application/data/tracking-code';

const STATUS_TONES: Readonly<Record<PublicApplicationStatus, BadgeTone>> = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
};

interface StatusResult {
  readonly code: string;
  readonly check: ApplicationStatusCheck;
}

/** C-02: status of an application by its tracking code. Shows no personal data. */
@Component({
  selector: 'app-status-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, IconComponent, StatusBadgeComponent],
  styleUrl: './status-check.component.scss',
  template: `
    <form class="status-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <label class="status-form__label" [for]="inputId()">Código de seguimiento *</label>
      <div class="status-form__row">
        <input
          [id]="inputId()"
          class="input mono"
          type="text"
          formControlName="code"
          placeholder="IG-XXXX-XXXX"
          autocomplete="off"
          spellcheck="false"
          autocapitalize="characters"
          required
        />
        <button type="submit" class="btn btn--primary" [disabled]="pending()">
          <app-icon name="search" [size]="16" />
          Consultar
        </button>
      </div>
      @if (form.controls.code.touched && form.controls.code.invalid) {
        <p class="field__error">Escribe el código que recibiste, por ejemplo {{ example }}.</p>
      }
    </form>

    <div class="status-result" aria-live="polite">
      @if (pending()) {
        <p class="text-muted">Consultando…</p>
      } @else if (errorMessage(); as message) {
        <p class="alert alert--danger">{{ message }}</p>
      } @else if (result(); as found) {
        <div class="status-card">
          <div class="status-card__header">
            <span class="chip chip--mono">{{ found.code }}</span>
            <app-status-badge [label]="found.check.statusLabel" [tone]="tones[found.check.status]" />
          </div>
          <dl class="status-card__dates">
            <div>
              <dt>Recibida</dt>
              <dd>{{ found.check.submittedOn | date: 'dd/MM/yyyy' }}</dd>
            </div>
            <div>
              <dt>Decisión</dt>
              <dd>
                {{ found.check.reviewedOn ? (found.check.reviewedOn | date: 'dd/MM/yyyy HH:mm') : 'Aún sin decidir' }}
              </dd>
            </div>
          </dl>
          @if (found.check.notice; as notice) {
            <p class="alert alert--danger status-card__notice" role="note">
              <app-icon name="info" [size]="16" />
              <span>{{ notice }}</span>
            </p>
          }
          <p class="status-card__privacy text-small text-muted">
            <app-icon name="lock" [size]="14" />
            Por tu privacidad, esta consulta muestra solo el estado y las fechas. No mostramos datos personales.
          </p>
        </div>
      }
    </div>
  `,
})
export class StatusCheckComponent {
  private readonly repository = inject(PublicApplicationRepository);

  /** Id of the code input; unique per page. */
  readonly inputId = input('tracking-code');

  protected readonly tones = STATUS_TONES;
  protected readonly example = TRACKING_CODE_EXAMPLE;
  protected readonly form = inject(NonNullableFormBuilder).group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
  });
  protected readonly pending = signal(false);
  protected readonly result = signal<StatusResult | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const code = normalizeTrackingCode(this.form.getRawValue().code);
    this.pending.set(true);
    this.errorMessage.set(null);
    this.result.set(null);
    try {
      const check = await firstValueFrom(this.repository.checkStatus(code));
      this.result.set({ code, check });
    } catch (error) {
      this.errorMessage.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
