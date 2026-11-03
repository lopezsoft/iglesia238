import { WizardStep } from '../application/components/application-stepper.component';

export type RegistrationStepId = 'church' | 'congregation' | 'manager';

export interface RegistrationStep extends WizardStep {
  readonly id: RegistrationStepId;
}

export const REGISTRATION_STEPS: readonly RegistrationStep[] = [
  { id: 'church', label: 'Iglesia', hint: 'Razón social de tu iglesia' },
  { id: 'congregation', label: 'Sede', hint: 'Datos y ubicación' },
  { id: 'manager', label: 'Tu usuario', hint: 'Administrador de la sede' },
];
