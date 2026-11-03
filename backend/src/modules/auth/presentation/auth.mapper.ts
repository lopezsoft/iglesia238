import type { AuthenticatedSession } from '../application/session-token.issuer.js';
import type { InvitationInfo } from '../application/invitations.use-cases.js';
import type { SessionView } from '../application/session-view.js';
import type {
  InvitationResponseDto,
  SessionResponseDto,
  TokenResponseDto,
} from './auth.dto.js';

export function toSessionResponse(session: SessionView): SessionResponseDto {
  return {
    id: session.id,
    displayName: session.displayName,
    email: session.email,
    emailVerified: session.emailVerified,
    assignments: session.assignments.map((assignment) => ({
      role: assignment.role,
      roleName: assignment.roleName,
      permissions: [...assignment.permissions],
      scope: { ...assignment.scope },
    })),
    selectableScopes: session.selectableScopes.map((scope) => ({ ...scope })),
  };
}

/** The refresh token never goes in the body: it travels only in the HttpOnly cookie. */
export function toTokenResponse(
  issued: AuthenticatedSession,
): TokenResponseDto {
  return {
    accessToken: issued.accessToken,
    expiresIn: issued.expiresIn,
    session: toSessionResponse(issued.session),
  };
}

export function toInvitationResponse(
  invitation: InvitationInfo,
): InvitationResponseDto {
  return {
    email: invitation.email,
    displayName: invitation.displayName,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}
