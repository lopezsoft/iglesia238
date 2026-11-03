import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../../../common/rate-limit/rate-limit.options.js';
import { GeoController } from './catalogs.controllers.js';

describe('GeoController', () => {
  it('rate-limits the creation of neighborhoods, a table shared by every denomination', () => {
    const handler = Object.getOwnPropertyDescriptor(
      GeoController.prototype,
      'ensure',
    )?.value as object;
    const options = Reflect.getMetadata(RATE_LIMIT_KEY, handler) as
      RateLimitOptions | undefined;

    expect(options).toMatchObject({
      name: 'neighborhood-create',
      limit: 30,
      windowSeconds: 3600,
    });
  });
});
