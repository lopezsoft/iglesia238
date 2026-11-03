import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitApplicationDto } from './public.dto.js';

const VALID = {
  congregationId: 10,
  policyId: 5,
  firstName: '  Ana   María ',
  lastName: 'Pérez',
  secondLastName: '',
  documentTypeCode: 'CC',
  documentNumber: '1023456789',
  birthDate: '1990-05-20',
  sex: 'FEMALE',
  maritalStatusCode: 'SINGLE',
  phone: '300 123 4567',
  email: '',
  address: 'Calle 1 # 2-3',
  municipalityCode: '13001',
  neighborhood: '',
  consentAccepted: true,
  website: '',
};

async function check(payload: Record<string, unknown>) {
  const dto = plainToInstance(SubmitApplicationDto, payload);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

describe('SubmitApplicationDto', () => {
  it('accepts the payload of the form and normalizes the text', async () => {
    const { dto, errors } = await check(VALID);

    expect(errors).toHaveLength(0);
    expect(dto.firstName).toBe('Ana María');
    expect(dto.secondLastName).toBeNull();
    expect(dto.email).toBeNull();
    expect(dto.neighborhood).toBeNull();
    expect(dto.guardian).toBeNull();
  });

  it.each([
    ['documentNumber', '1.023.456.789'],
    ['phone', 'abc'],
    ['birthDate', '20/05/1990'],
    ['email', 'no-es-correo'],
    ['sex', 'OTHER'],
    ['municipalityCode', 'Cartagena'],
    ['firstName', ''],
    ['consentAccepted', 'yes'],
  ])('rejects an invalid %s', async (field, value) => {
    const { errors } = await check({ ...VALID, [field]: value });

    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('rejects fields the form does not have, such as the denomination', async () => {
    const { errors } = await check({ ...VALID, denominationId: 99 });

    expect(errors.map((error) => error.property)).toContain('denominationId');
  });

  it('validates the guardian when it is present', async () => {
    const guardian = {
      firstName: 'Marta',
      lastName: 'Ruiz',
      documentTypeCode: 'CC',
      documentNumber: '52345678',
      relationship: 'Madre',
      phone: '3009999999',
    };

    expect((await check({ ...VALID, guardian })).errors).toHaveLength(0);
    const { errors } = await check({
      ...VALID,
      guardian: { ...guardian, relationship: 'Vecina' },
    });
    expect(errors[0]?.property).toBe('guardian');
  });
});
