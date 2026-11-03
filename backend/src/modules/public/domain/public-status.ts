import type { ApplicationStatus } from '../../membership-applications/domain/application-status.js';

/** Statuses an applicant can see. DUPLICATE is an internal finding, so it reads as "in review". */
export type PublicApplicationStatus = Exclude<ApplicationStatus, 'DUPLICATE'>;

export const PUBLIC_STATUS_LABELS: Readonly<
  Record<PublicApplicationStatus, string>
> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};

/** Shown with a rejection. The reviewer's reason is internal and never leaves the review screen. */
export const REJECTION_NOTICE =
  'Tu solicitud no fue aprobada. Comunícate con la secretaría de la sede para conocer los detalles y, si es el caso, presentar una nueva solicitud.';

export interface PublicStatusInput {
  status: ApplicationStatus;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface PublicStatusView {
  status: PublicApplicationStatus;
  statusLabel: string;
  submittedOn: string;
  reviewedOn: string | null;
  notice: string | null;
}

/**
 * What an applicant may learn from a tracking code: the status, the dates and, for a rejection, a
 * generic notice. Nothing else leaves the system: no names, no reviewer, no reason, no duplicate flag.
 */
export function toPublicStatus(input: PublicStatusInput): PublicStatusView {
  const status: PublicApplicationStatus =
    input.status === 'DUPLICATE' ? 'IN_REVIEW' : input.status;
  const decided = status === 'APPROVED' || status === 'REJECTED';
  return {
    status,
    statusLabel: PUBLIC_STATUS_LABELS[status],
    submittedOn: input.createdAt.toISOString(),
    reviewedOn:
      decided && input.reviewedAt ? input.reviewedAt.toISOString() : null,
    notice: status === 'REJECTED' ? REJECTION_NOTICE : null,
  };
}

export const GUARDIAN_RELATIONSHIPS: readonly string[] = [
  'Madre',
  'Padre',
  'Abuelo(a)',
  'Hermano(a) mayor de edad',
  'Tío(a)',
  'Tutor(a) legal',
  'Otro',
];
