import { apiUrl } from '../../core/http/api-url';

/**
 * URL of a logo from its storage key (`branding/<id>/logo-<hash>.png`). The API serves it publicly and forever: the
 * name carries a hash of the content, so a new logo is a new URL and the old certificates keep theirs.
 */
export function brandingFileUrl(logoKey: string): string {
  return apiUrl(`/public/${logoKey}`);
}
