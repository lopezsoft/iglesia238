import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ApplicationStep, StepId } from '../application-steps';

type StepState = 'done' | 'current' | 'pending';

/** Progress of the public form: done steps get a check, the current one is highlighted. */
@Component({
  selector: 'app-application-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styleUrl: './application-stepper.component.scss',
  template: `
    <ol class="stepper" aria-label="Pasos de la solicitud">
      @for (step of items(); track step.id; let index = $index) {
        <li class="stepper__item" [class]="'stepper__item--' + step.state" [attr.aria-current]="step.state === 'current' ? 'step' : null">
          <span class="stepper__marker" aria-hidden="true">
            @if (step.state === 'done') {
              <app-icon name="check" [size]="16" />
            } @else {
              {{ index + 1 }}
            }
          </span>
          <span class="stepper__text">
            <span class="stepper__label">
              {{ step.label }}
              @if (step.state === 'done') {
                <span class="visually-hidden">(completado)</span>
              }
            </span>
            <span class="stepper__hint">{{ step.hint }}</span>
          </span>
        </li>
      }
    </ol>
  `,
})
export class ApplicationStepperComponent {
  readonly steps = input.required<readonly ApplicationStep[]>();
  readonly current = input.required<StepId>();

  protected readonly items = computed(() => {
    const currentIndex = this.steps().findIndex((step) => step.id === this.current());
    return this.steps().map((step, index) => ({
      ...step,
      state: (index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending') as StepState,
    }));
  });
}
