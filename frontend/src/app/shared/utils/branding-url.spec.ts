import { brandingFileUrl } from './branding-url';

describe('brandingFileUrl', () => {
  it('points to the public route of the API that serves the logo of a key', () => {
    expect(brandingFileUrl('branding/12/logo-3f9a1c0b5d7e2a46.png')).toBe(
      '/api/public/branding/12/logo-3f9a1c0b5d7e2a46.png',
    );
  });
});
