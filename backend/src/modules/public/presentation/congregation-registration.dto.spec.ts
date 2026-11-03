import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterCongregationDto } from './congregation-registration.dto.js';

const VALID = {
  legalEntityId: 12,
  congregation: {
    name: '  Sede   Norte ',
    municipalityCode: '13001',
    address: 'Calle 1 # 2-3',
    phone: '300 123 4567',
    email: 'sede@iglesia.org',
  },
  manager: {
    displayName: ' Laura   Gómez ',
    email: ' Laura@Iglesia.ORG ',
    password: 'Cordero-2026-Fuerte',
  },
};

async function check(payload: unknown) {
  const dto = plainToInstance(RegisterCongregationDto, payload);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

describe('RegisterCongregationDto', () => {
  it('accepts the payload of the form and normalizes the text and the e-mail', async () => {
    const { dto, errors } = await check(VALID);

    expect(errors).toHaveLength(0);
    expect(dto.congregation.name).toBe('Sede Norte');
    expect(dto.manager.displayName).toBe('Laura Gómez');
    expect(dto.manager.email).toBe('laura@iglesia.org');
  });

  it('accepts only the required fields, and empty optional texts become null', async () => {
    const { dto, errors } = await check({
      legalEntityId: 12,
      congregation: {
        name: 'Sede Norte',
        municipalityCode: '13001',
        address: '',
        phone: '',
        email: '',
      },
      manager: VALID.manager,
    });

    expect(errors).toHaveLength(0);
    expect(dto.congregation.address).toBeNull();
    expect(dto.congregation.email).toBeNull();
  });

  it.each([undefined, '', null])(
    'requires the municipality of the sede (%s)',
    async (municipalityCode) => {
      const { errors } = await check({
        ...VALID,
        congregation: { ...VALID.congregation, municipalityCode },
      });

      const nested = errors.find((error) => error.property === 'congregation');
      expect(nested?.children?.map((child) => child.property)).toContain(
        'municipalityCode',
      );
    },
  );

  it.each([
    ['legalEntityId', 'doce'],
    ['legalEntityId', 0],
    ['congregation', undefined],
    ['manager', undefined],
  ])('rejects an invalid %s', async (field, value) => {
    const { errors } = await check({ ...VALID, [field]: value });

    expect(errors.map((error) => error.property)).toContain(field);
  });

  it.each([
    ['congregation', 'name', ''],
    ['congregation', 'municipalityCode', 'Cartagena'],
    ['congregation', 'email', 'no-es-correo'],
    ['congregation', 'phone', 'abc'],
    ['manager', 'displayName', 'Lu'],
    ['manager', 'email', 'no-es-correo'],
    ['manager', 'password', 12345],
  ])('rejects an invalid %s.%s', async (group, field, value) => {
    const { errors } = await check({
      ...VALID,
      [group]: {
        ...VALID[group as 'congregation' | 'manager'],
        [field]: value,
      },
    });

    const nested = errors.find((error) => error.property === group);
    expect(nested?.children?.map((child) => child.property)).toContain(field);
  });

  it('rejects fields it does not know (the denomination is never sent by the client)', async () => {
    const { errors } = await check({ ...VALID, denominationId: 1 });

    expect(errors.map((error) => error.property)).toContain('denominationId');
  });
});
