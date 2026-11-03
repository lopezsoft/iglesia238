import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CashBookQueryDto,
  ConsolidateDto,
  RecordMovementDto,
  ReverseMovementDto,
  VoucherListQueryDto,
} from './cash-book.dto.js';

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

describe('cash book DTOs', () => {
  const movement = {
    fundId: 1,
    direction: 'OUT',
    accountId: 4,
    postedOn: '2026-11-02',
    amount: 398700.5,
    description: 'Pago de energía',
  };

  it('accepts a well formed movement', async () => {
    expect(await messagesOf(RecordMovementDto, movement)).toEqual([]);
  });

  it('rejects malformed movements with Spanish messages', async () => {
    const messages = await messagesOf(RecordMovementDto, {
      ...movement,
      direction: 'SIDEWAYS',
      postedOn: '02/11/2026',
      amount: 10.123,
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        'Indica si el movimiento es una entrada o una salida.',
        'La fecha debe tener el formato AAAA-MM-DD.',
        'El valor debe ser un número con máximo dos decimales.',
      ]),
    );
  });

  it('does not accept fields the API does not know', async () => {
    expect(
      await messagesOf(RecordMovementDto, { ...movement, createdById: 1 }),
    ).not.toEqual([]);
  });

  it('requires a date and a reason for a reversal, and a date for a consolidation', async () => {
    expect(await messagesOf(ReverseMovementDto, {})).not.toEqual([]);
    expect(await messagesOf(ConsolidateDto, { date: 'hoy' })).toEqual([
      'La fecha debe tener el formato AAAA-MM-DD.',
    ]);
  });

  it('converts the numeric query parameters of the book and the vouchers', async () => {
    const book = plainToInstance(CashBookQueryDto, {
      fundId: '3',
      periodId: '7',
      page: '2',
    });
    expect(book).toMatchObject({ fundId: 3, periodId: 7, page: 2 });
    expect(await validate(book)).toHaveLength(0);

    const vouchers = plainToInstance(VoucherListQueryDto, {
      type: 'XX',
      number: '12',
    });
    expect(vouchers.number).toBe(12);
    expect((await validate(vouchers)).length).toBeGreaterThan(0);
  });
});
