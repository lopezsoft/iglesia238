import {
  currentPolicyId,
  policyState,
  type PolicyDates,
} from './current-policy.js';

const policies: PolicyDates[] = [
  { id: 1, status: 'PUBLISHED', effectiveFrom: '2025-01-01' },
  { id: 2, status: 'PUBLISHED', effectiveFrom: '2026-03-01' },
  { id: 3, status: 'PUBLISHED', effectiveFrom: '2026-03-01' },
  { id: 4, status: 'PUBLISHED', effectiveFrom: '2027-01-01' },
  { id: 5, status: 'DRAFT', effectiveFrom: '2026-06-01' },
];

describe('currentPolicyId', () => {
  it('picks the latest effective date already arrived, then the newest id', () => {
    expect(currentPolicyId(policies, '2026-11-02')).toBe(3);
  });

  it('ignores drafts and future policies', () => {
    expect(currentPolicyId(policies, '2025-06-01')).toBe(1);
    expect(currentPolicyId(policies, '2024-01-01')).toBeNull();
    expect(
      currentPolicyId(
        [{ id: 5, status: 'DRAFT', effectiveFrom: '2020-01-01' }],
        '2026-11-02',
      ),
    ).toBeNull();
  });
});

describe('policyState', () => {
  it('classifies each policy', () => {
    const today = '2026-11-02';
    const current = currentPolicyId(policies, today);
    expect(policies.map((p) => policyState(p, current, today))).toEqual([
      'SUPERSEDED',
      'SUPERSEDED',
      'CURRENT',
      'SCHEDULED',
      'DRAFT',
    ]);
  });
});
