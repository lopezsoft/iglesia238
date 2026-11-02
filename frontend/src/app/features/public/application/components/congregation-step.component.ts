import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { municipalityLabel } from '../../../../core/models/catalogs';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { OpenCongregation } from '../data/public-application.models';
import { showsError } from '../application-form';

/** Step 1: choose the congregation (only the ones accepting applications are listed). */
@Component({
  selector: 'app-congregation-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IconComponent],
  styleUrl: './congregation-step.component.scss',
  template: `
    <fieldset class="step">
      <legend class="step__legend">Elige tu sede</legend>
      <p class="text-muted step__lead">Mostramos solo las sedes que están recibiendo solicitudes en este momento.</p>
      <div class="sedes">
        @for (congregation of congregations(); track congregation.id) {
          <label class="sede" [class.sede--selected]="control().value === congregation.id">
            <input
              type="radio"
              name="congregation"
              [formControl]="control()"
              [value]="congregation.id"
              [attr.aria-describedby]="hasError() ? 'congregation-error' : null"
            />
            <span class="sede__body">
              <span class="sede__name">{{ congregation.name }}</span>
              <span class="text-muted text-small">{{ congregation.denominationName }}</span>
              <span class="sede__place text-small">
                <app-icon name="home" [size]="14" />
                {{ municipality(congregation.municipalityCode) }}
              </span>
              @if (congregation.address) {
                <span class="text-muted text-small">{{ addressOf(congregation) }}</span>
              }
              <span class="badge badge--success sede__badge">Recibe solicitudes</span>
            </span>
          </label>
        }
      </div>
      @if (hasError()) {
        <p id="congregation-error" class="field__error step__error" role="alert">Selecciona una sede para continuar.</p>
      }
    </fieldset>
  `,
})
export class CongregationStepComponent {
  readonly congregations = input.required<readonly OpenCongregation[]>();
  readonly control = input.required<FormControl<number | null>>();
  readonly revealErrors = input(false);

  protected readonly municipality = municipalityLabel;

  protected addressOf(congregation: OpenCongregation): string {
    return [congregation.address, congregation.neighborhood].filter(Boolean).join(', ');
  }

  protected hasError(): boolean {
    return showsError(this.control(), this.revealErrors());
  }
}
