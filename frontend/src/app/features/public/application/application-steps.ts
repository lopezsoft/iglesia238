export type StepId = 'congregation' | 'personal' | 'guardian' | 'consent';

export interface ApplicationStep {
  readonly id: StepId;
  readonly label: string;
  readonly hint: string;
}

export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { id: 'congregation', label: 'Sede', hint: 'Dónde te congregarás' },
  { id: 'personal', label: 'Datos personales', hint: 'Identificación y contacto' },
  { id: 'guardian', label: 'Acudiente', hint: 'Requerido: menor de edad' },
  { id: 'consent', label: 'Autorización de datos', hint: 'Ley 1581 de 2012' },
];

/** What the applicant reviews before sending. */
export interface ApplicationSummary {
  readonly congregationName: string;
  readonly applicantName: string;
  readonly document: string;
  readonly birthDate: string;
  readonly municipality: string;
  readonly phone: string;
  readonly email: string | null;
  readonly guardian: string | null;
}
