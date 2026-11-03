/** Hidden part of an address, so reading the log never exposes a full IP. */
const HIDDEN = '•••';
const IPV4_MAPPED_PREFIX = /^::ffff:/i;

/**
 * Keeps the network part of an address: 181.52.10.24 becomes 181.52.•••.•••. An IPv6 address keeps its
 * first two groups; anything else is hidden entirely. No address shows as a dash.
 */
export function maskIpAddress(ip: string | null): string {
  if (!ip) {
    return '—';
  }
  const address = ip.trim().replace(IPV4_MAPPED_PREFIX, '');
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(address);
  if (ipv4) {
    return `${ipv4[1]}.${ipv4[2]}.${HIDDEN}.${HIDDEN}`;
  }
  const groups = address.split(':');
  if (groups.length > 2 && groups[0] && groups[1]) {
    return `${groups[0]}:${groups[1]}:••••`;
  }
  return HIDDEN;
}

/** A field diff with the values ready to display. */
export interface AuditFieldChangeView {
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Turns the `changes` JSON of an entry into the list the screen renders. */
export function formatChanges(changes: unknown): AuditFieldChangeView[] {
  if (
    changes === null ||
    typeof changes !== 'object' ||
    Array.isArray(changes)
  ) {
    return [];
  }
  return Object.entries(changes as Record<string, unknown>).map(
    ([field, change]) => {
      const diff =
        change !== null && typeof change === 'object'
          ? (change as { from?: unknown; to?: unknown })
          : {};
      return {
        field,
        from: formatValue(diff.from),
        to: formatValue(diff.to),
      };
    },
  );
}

/** Actions the summary cards count. */
export const ROLE_CHANGE_ACTIONS: readonly string[] = [
  'ROLE_GRANTED',
  'ROLE_REVOKED',
  'USER_INVITED',
];
export const CONTRIBUTION_VOID_ACTION = 'CONTRIBUTION_VOIDED';
export const PERIOD_CLOSE_ACTION = 'PERIOD_CLOSED';
