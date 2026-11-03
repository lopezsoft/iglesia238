import { NotFoundDomainException } from '../../src/common/errors/domain.exception.js';
import type { TenantScope } from '../../src/common/tenancy/tenant-scope.js';
import { TENANT_A, TENANT_A_SIBLING, TENANT_B } from './tenants.js';

export interface CrossTenantCase<TId> {
  /** Creates a resource that belongs to `owner` (usually in a fake repository) and returns its id. */
  arrange: (owner: TenantScope) => TId | Promise<TId>;
  /** Runs the use case or repository method under `scope` against the resource. */
  act: (scope: TenantScope, id: TId) => Promise<unknown>;
  /**
   * Whether the resource belongs to one congregation, so a sibling congregation of the same
   * denomination must not see it either. Default true; use false for denomination-wide resources.
   */
  congregationLevel?: boolean;
}

/** The rule of the whole API: another tenant's resource answers 404, never 403 and never its data. */
export async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(NotFoundDomainException);
}

/**
 * Registers the cross-tenant tests of a use case: the owner reaches the resource, and another
 * denomination (and, for congregation-level data, a sibling congregation) gets 404.
 * Every business use case ships one of these.
 */
export function describeCrossTenantIsolation<TId>(
  name: string,
  testCase: CrossTenantCase<TId>,
): void {
  describe(`${name}: tenant isolation`, () => {
    it('lets the owner tenant reach its resource', async () => {
      const id = await testCase.arrange(TENANT_A);

      await expect(testCase.act(TENANT_A, id)).resolves.not.toThrow();
    });

    it('answers 404 to another denomination', async () => {
      const id = await testCase.arrange(TENANT_A);

      await expectNotFound(testCase.act(TENANT_B, id));
    });

    if (testCase.congregationLevel !== false) {
      it('answers 404 to a sibling congregation of the same denomination', async () => {
        const id = await testCase.arrange(TENANT_A);

        await expectNotFound(testCase.act(TENANT_A_SIBLING, id));
      });
    }
  });
}
