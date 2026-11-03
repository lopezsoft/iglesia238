// Login lockout policy (A-01). The API enforces it with Redis; the UI only explains it.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
