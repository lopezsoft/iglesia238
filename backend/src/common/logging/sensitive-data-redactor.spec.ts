import { redactSensitiveData } from './sensitive-data-redactor.js';

describe('redactSensitiveData', () => {
  it('redacts sensitive keys at any depth', () => {
    const result = redactSensitiveData({
      id: 7,
      password: 'plain',
      person: {
        documentNumber: '123',
        email: 'a@b.co',
        firstName: 'Ana',
        guardianName: 'Luis',
        sex: 'FEMALE',
      },
    });

    expect(result).toEqual({
      id: 7,
      password: '[REDACTED]',
      person: {
        documentNumber: '[REDACTED]',
        email: '[REDACTED]',
        firstName: '[REDACTED]',
        guardianName: '[REDACTED]',
        sex: 'FEMALE',
      },
    });
  });

  it('masks credentials and emails inside text', () => {
    const text =
      'mysql://user:hunter2@db:3306/x sent to a.b@example.com with Bearer abc.def';

    const result = redactSensitiveData(text) as string;

    expect(result).not.toContain('hunter2');
    expect(result).not.toContain('a.b@example.com');
    expect(result).not.toContain('abc.def');
    expect(result).toContain('db:3306/x');
  });

  it('masks URLs with an empty user, as used by Redis', () => {
    const result = redactSensitiveData('redis://:hunter2@redis:6379') as string;

    expect(result).not.toContain('hunter2');
    expect(result).toContain('redis:6379');
  });

  it('masks key-value pairs inside free text', () => {
    const result = redactSensitiveData(
      'documentNumber: "123456" password=hunter2, status: ok',
    ) as string;

    expect(result).not.toContain('123456');
    expect(result).not.toContain('hunter2');
    expect(result).toContain('status: ok');
  });

  it('redacts error stacks', () => {
    const error = new Error('cannot reach mysql://root:hunter2@db');

    expect(redactSensitiveData(error)).not.toContain('hunter2');
  });

  it('keeps dates readable and survives invalid ones', () => {
    expect(redactSensitiveData(new Date('2026-01-02T00:00:00.000Z'))).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    expect(redactSensitiveData(new Date(Number.NaN))).toBeNull();
  });

  it('stops at circular or very deep structures', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => redactSensitiveData(circular)).not.toThrow();
  });
});
