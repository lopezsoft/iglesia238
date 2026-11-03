import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateAccountDto,
  OpenPeriodDto,
  SaveContributionTypeDto,
  SaveFundDto,
  SaveTitheRuleDto,
} from './setup.dto.js';

async function messagesOf<T extends object>(
  type: new () => T,
  plain: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('accounting setup DTOs', () => {
  it('accepts a fund with or without opening balance, null included', async () => {
    expect(
      await messagesOf(SaveFundDto, { name: 'Misiones', isActive: true }),
    ).toEqual([]);
    expect(
      await messagesOf(SaveFundDto, {
        name: 'Misiones',
        isActive: true,
        openingBalance: null,
      }),
    ).toEqual([]);
    expect(
      await messagesOf(SaveFundDto, {
        name: 'Misiones',
        isActive: true,
        openingBalance: 350000,
      }),
    ).toEqual([]);
  });

  it('rejects a fund without name or with a text balance', async () => {
    expect(
      await messagesOf(SaveFundDto, {
        isActive: true,
        openingBalance: 'mucho',
      }),
    ).toEqual(
      expect.arrayContaining([
        'El nombre del fondo es obligatorio.',
        'El saldo inicial debe ser un número.',
      ]),
    );
  });

  it('requires the nature and the postable flag of an account', async () => {
    expect(
      await messagesOf(CreateAccountDto, { code: '410505', name: 'Diezmos' }),
    ).toEqual(
      expect.arrayContaining([
        'La naturaleza de la cuenta no es válida.',
        'Indica si la cuenta es imputable.',
      ]),
    );
  });

  it('limits the category of a contribution type', async () => {
    expect(
      await messagesOf(SaveContributionTypeDto, {
        code: 'DIEZMO',
        name: 'Diezmo',
        category: 'OTRA',
        accountId: 1,
      }),
    ).toEqual(['La categoría no es válida.']);
  });

  it('keeps the month of a period between 1 and 12', async () => {
    expect(await messagesOf(OpenPeriodDto, { year: 2026, month: 11 })).toEqual(
      [],
    );
    expect(
      await messagesOf(OpenPeriodDto, { year: 2026, month: 13 }),
    ).not.toEqual([]);
  });

  it('keeps the tithe rates between 0 and 1 and the date as ISO', async () => {
    const valid = {
      effectiveFrom: '2026-01-01',
      nationalShareRate: 0.21,
      localFundRate: 0.03,
    };
    expect(await messagesOf(SaveTitheRuleDto, valid)).toEqual([]);
    expect(
      await messagesOf(SaveTitheRuleDto, {
        ...valid,
        nationalShareRate: 21,
        effectiveFrom: 'enero',
      }),
    ).toHaveLength(2);
  });
});
