import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  DONATION_ISSUE_PERMISSION,
  canIssueDonations,
  canSeeType,
  donationsOnly,
  restrictedFilter,
} from './certificate-access.js';
import type { CertificateFilter } from './certificate.models.js';

const as = (...permissions: string[]) => buildTenantContext({ permissions });

const secretary = as('certificates.issue');
const pastor = as('certificates.issue', 'contributions.read');
const treasurer = as('contributions.read', DONATION_ISSUE_PERMISSION);
const both = as('certificates.issue', DONATION_ISSUE_PERMISSION);

describe('donationsOnly', () => {
  it('is true only for who holds the donations permission without the general one', () => {
    expect(donationsOnly(treasurer)).toBe(true);
    expect(donationsOnly(as(DONATION_ISSUE_PERMISSION))).toBe(true);
    expect(donationsOnly(secretary)).toBe(false);
    expect(donationsOnly(pastor)).toBe(false);
    expect(donationsOnly(both)).toBe(false);
    expect(donationsOnly(as('contributions.read'))).toBe(false);
  });
});

describe('canIssueDonations', () => {
  it('needs the donations permission, or the general one together with reading the contributions', () => {
    expect(canIssueDonations(treasurer)).toBe(true);
    expect(canIssueDonations(as(DONATION_ISSUE_PERMISSION))).toBe(true);
    expect(canIssueDonations(pastor)).toBe(true);
    expect(canIssueDonations(both)).toBe(true);
    expect(canIssueDonations(secretary)).toBe(false);
    expect(canIssueDonations(as('contributions.read'))).toBe(false);
  });
});

describe('canSeeType', () => {
  it('shows every type to the general permission and only the donations one to the treasury', () => {
    for (const code of ['MEM', 'TRA', 'BAU', 'ASI', 'DON']) {
      expect(canSeeType(secretary, code)).toBe(true);
      expect(canSeeType(both, code)).toBe(true);
    }
    expect(canSeeType(treasurer, 'DON')).toBe(true);
    for (const code of ['MEM', 'TRA', 'BAU', 'ASI']) {
      expect(canSeeType(treasurer, code)).toBe(false);
    }
  });
});

describe('restrictedFilter', () => {
  const filter: CertificateFilter = {
    typeCode: 'MEM',
    status: 'ISSUED',
    q: 'ana',
    sort: 'issuedOn:desc',
  };

  it('leaves the filter of the general permission as it is', () => {
    expect(restrictedFilter(secretary, filter)).toBe(filter);
  });

  it('forces the donations type for the treasury, whatever type was asked for, and keeps the rest', () => {
    expect(restrictedFilter(treasurer, filter)).toEqual({
      ...filter,
      typeCode: 'DON',
    });
    expect(restrictedFilter(treasurer, { sort: 'issuedOn:asc' })).toEqual({
      sort: 'issuedOn:asc',
      typeCode: 'DON',
    });
  });
});
