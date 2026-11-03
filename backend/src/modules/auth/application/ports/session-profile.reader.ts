import type { SessionView } from '../session-view.js';

export const SESSION_PROFILE_READER = Symbol('SESSION_PROFILE_READER');

/** Builds the session of a user from the database: active roles with their permissions, and scopes. */
export interface SessionProfileReader {
  /**
   * Null when the user does not exist. Roles of a deactivated denomination, or of a deleted or
   * deactivated congregation, are left out: there is nothing to act on.
   */
  load(userId: number): Promise<SessionView | null>;
}
