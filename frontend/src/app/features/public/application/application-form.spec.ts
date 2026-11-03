import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { todayIso } from './data/public-application.models';
import { plausibleBirthDate, resetConsentWhenPolicyChanges } from './application-form';

function setupConsent(initialPolicyId: number | undefined) {
  const accepted = new FormControl(false, { nonNullable: true });
  const policyId = signal<number | undefined>(initialPolicyId);
  TestBed.runInInjectionContext(() => resetConsentWhenPolicyChanges(accepted, policyId));
  TestBed.tick();
  return { accepted, policyId };
}

describe('resetConsentWhenPolicyChanges (C-01, Ley 1581)', () => {
  it('clears the tick when the policy of another denomination is loaded', () => {
    const { accepted, policyId } = setupConsent(1);
    accepted.setValue(true);

    // Back to the sede step, another denomination: the old policy unloads, then policy 2 arrives.
    policyId.set(undefined);
    TestBed.tick();
    expect(accepted.value).toBe(true);

    policyId.set(2);
    TestBed.tick();
    expect(accepted.value).toBe(false);
  });

  it('keeps the tick when the same policy is shown again (another sede of the same denomination)', () => {
    const { accepted, policyId } = setupConsent(1);
    accepted.setValue(true);

    policyId.set(undefined);
    TestBed.tick();
    policyId.set(1);
    TestBed.tick();

    expect(accepted.value).toBe(true);
  });

  it('does not clear a tick given while the first policy was loading', () => {
    const { accepted, policyId } = setupConsent(undefined);
    accepted.setValue(true);

    policyId.set(1);
    TestBed.tick();

    expect(accepted.value).toBe(true);
  });
});

describe('plausibleBirthDate', () => {
  const validate = (value: string) => plausibleBirthDate(new FormControl(value, { nonNullable: true }));

  it('tells a future date from an age above 120 years', () => {
    const year = Number(todayIso().slice(0, 4));

    expect(validate(`${year + 1}-01-01`)).toEqual({ birthDate: 'future' });
    expect(validate(`${year - 121}-01-01`)).toEqual({ birthDate: 'tooOld' });
    expect(validate(`${year - 30}-01-01`)).toBeNull();
    expect(validate('')).toBeNull();
  });
});
