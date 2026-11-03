export const APPLICATION_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'DUPLICATE',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Only these statuses can still be approved, rejected or marked as duplicate. */
export const REVIEWABLE_STATUSES: readonly ApplicationStatus[] = [
  'PENDING',
  'IN_REVIEW',
];

export function isReviewable(status: ApplicationStatus): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}

/** Chips of the review queue. "PENDING" groups PENDING and IN_REVIEW. */
export const APPLICATION_FILTERS = [
  'PENDING',
  'DUPLICATE',
  'APPROVED',
  'REJECTED',
  'ALL',
] as const;

export type ApplicationFilter = (typeof APPLICATION_FILTERS)[number];

export const FILTER_STATUSES: Readonly<
  Record<ApplicationFilter, readonly ApplicationStatus[]>
> = {
  PENDING: ['PENDING', 'IN_REVIEW'],
  DUPLICATE: ['DUPLICATE'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
  ALL: APPLICATION_STATUSES,
};

export type ApplicationCounts = Readonly<Record<ApplicationFilter, number>>;

/** Folds the count per status into the count per chip. */
export function countByFilter(
  byStatus: Readonly<Partial<Record<ApplicationStatus, number>>>,
): ApplicationCounts {
  const counts = {} as Record<ApplicationFilter, number>;
  for (const filter of APPLICATION_FILTERS) {
    counts[filter] = FILTER_STATUSES[filter].reduce(
      (sum, status) => sum + (byStatus[status] ?? 0),
      0,
    );
  }
  return counts;
}

/** rejection_reason is VARCHAR(255). */
export const REJECTION_REASON_MAX_LENGTH = 255;
/** The reason is read by the next reviewer and by the audit, so it has to say something. */
export const REJECTION_REASON_MIN_LENGTH = 10;
