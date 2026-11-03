import {
  DENOMINATION_TEMPLATE,
  PRIVACY_POLICY_DRAFT,
} from './denomination-template.js';

describe('DENOMINATION_TEMPLATE privacy policy', () => {
  it('holds only the policy text: what is published is what applicants read and accept', () => {
    expect(PRIVACY_POLICY_DRAFT).not.toMatch(/borrador/i);
    expect(PRIVACY_POLICY_DRAFT.trimEnd().endsWith('las normas.')).toBe(true);
    expect(DENOMINATION_TEMPLATE.privacyPolicy.content).toBe(
      PRIVACY_POLICY_DRAFT,
    );
  });
});
