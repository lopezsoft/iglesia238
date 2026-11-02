import { redact } from './debug.service';

describe('redact', () => {
  it('hides credentials and personal data at any depth', () => {
    const result = redact({
      status: 'APPROVED',
      password: 'secret',
      person: { firstName: 'Ana', documentNumber: '123', phone: '300', age: 30 },
      items: [{ accessToken: 'abc', id: 7 }],
    });

    expect(result).toEqual({
      status: 'APPROVED',
      password: '[redactado]',
      person: { firstName: '[redactado]', documentNumber: '[redactado]', phone: '[redactado]', age: 30 },
      items: [{ accessToken: '[redactado]', id: 7 }],
    });
  });

  it('leaves primitives untouched', () => {
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });
});
