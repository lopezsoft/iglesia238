import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../../../common/rate-limit/rate-limit.options.js';
import { UsersController } from './users.controllers.js';

describe('UsersController', () => {
  it('rate-limits invitations: the answer differs for an e-mail that already has an account', () => {
    const handler = Object.getOwnPropertyDescriptor(
      UsersController.prototype,
      'invite',
    )?.value as object;
    const options = Reflect.getMetadata(RATE_LIMIT_KEY, handler) as
      RateLimitOptions | undefined;

    expect(options).toMatchObject({
      name: 'users-invite',
      limit: 20,
      windowSeconds: 3600,
    });
  });
});
