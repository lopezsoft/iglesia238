import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../../../common/security/permissions.decorator.js';
import {
  CancelVowPledgeDto,
  CreateVowPledgeDto,
  ListVowPledgesQueryDto,
  UpdateVowPledgeDto,
} from '../../vows/presentation/vows.dto.js';
import { VowPledgesController } from '../../vows/presentation/vows.controller.js';
import {
  ContributionFilterQueryDto,
  ListContributionsQueryDto,
  RecordContributionDto,
  SearchContributorsQueryDto,
  VoidContributionDto,
} from './contributions.dto.js';
import {
  ContributionsController,
  ContributorsController,
} from './contributions.controller.js';

/** Same options as the global ValidationPipe of the API. */
async function errorsOf<T extends object>(
  type: new () => T,
  plain: object,
): Promise<string[]> {
  const instance = plainToInstance(type, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

const validRecord = {
  contributionTypeId: 1,
  receivedOn: '2026-11-02',
  amount: 250000,
  paymentMethod: 'CASH',
};

describe('RecordContributionDto', () => {
  it('accepts the minimal body and the full body', async () => {
    expect(await errorsOf(RecordContributionDto, validRecord)).toEqual([]);
    expect(
      await errorsOf(RecordContributionDto, {
        ...validRecord,
        personId: 5,
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'TRX 884120',
        vowPledgeId: null,
        notes: 'Culto dominical',
      }),
    ).toEqual([]);
  });

  it.each([
    ['a zero amount', { amount: 0 }],
    ['an amount with three decimals', { amount: 10.123 }],
    ['an amount as text', { amount: '10' }],
    ['an unknown payment method', { paymentMethod: 'BITCOIN' }],
    ['a date with the wrong format', { receivedOn: '02/11/2026' }],
    ['a reference over 80 characters', { paymentReference: 'x'.repeat(81) }],
    ['a field the API does not know', { recordedById: 99 }],
  ])('rejects %s', async (_label, patch) => {
    expect(
      (await errorsOf(RecordContributionDto, { ...validRecord, ...patch }))
        .length,
    ).toBeGreaterThan(0);
  });

  it('turns blank text into null so an empty reference is not stored', () => {
    const dto = plainToInstance(RecordContributionDto, {
      ...validRecord,
      paymentReference: '   ',
      notes: '',
    });

    expect(dto.paymentReference).toBeNull();
    expect(dto.notes).toBeNull();
  });
});

describe('query DTOs', () => {
  it('converts the numbers of the query string and applies the paging defaults', async () => {
    const query = plainToInstance(ListContributionsQueryDto, {
      year: '2026',
      month: '11',
      contributionTypeId: '3',
    });

    expect(
      await validate(query, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(query).toMatchObject({
      year: 2026,
      month: 11,
      contributionTypeId: 3,
      page: 1,
      pageSize: 25,
    });
  });

  it.each([
    [{ month: '13' }],
    [{ category: 'GIFT' }],
    [{ status: 'PAID' }],
    [{ from: '2026-1-1' }],
    [{ pageSize: '500' }],
    [{ search: 'x'.repeat(81) }],
  ])('rejects %j', async (patch) => {
    expect(
      (await errorsOf(ListContributionsQueryDto, patch)).length,
    ).toBeGreaterThan(0);
  });

  it('the export accepts the filters but not the paging', async () => {
    expect(
      await errorsOf(ContributionFilterQueryDto, { year: '2026', month: '11' }),
    ).toEqual([]);
    expect(
      (await errorsOf(ContributionFilterQueryDto, { page: '2' })).length,
    ).toBeGreaterThan(0);
  });

  it('reads the overdue flag of the vows list', async () => {
    const query = plainToInstance(ListVowPledgesQueryDto, {
      overdueOnly: 'true',
      status: 'ACTIVE',
    });

    expect(
      await validate(query, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(query.overdueOnly).toBe(true);
  });

  it('requires the text of the contributor search', async () => {
    expect(
      (await errorsOf(SearchContributorsQueryDto, {})).length,
    ).toBeGreaterThan(0);
    expect(await errorsOf(SearchContributorsQueryDto, { q: 'Ana' })).toEqual(
      [],
    );
  });
});

describe('reason bodies', () => {
  it('ask for at least ten characters', async () => {
    expect(await errorsOf(VoidContributionDto, { reason: 'corto' })).toEqual([
      'Describe el motivo de la anulación (mínimo 10 caracteres).',
    ]);
    expect(
      await errorsOf(CancelVowPledgeDto, { reason: 'Motivo suficiente.' }),
    ).toEqual([]);
  });
});

describe('vow pledge bodies', () => {
  it('validate the creation', async () => {
    const valid = {
      personId: 1,
      contributionTypeId: 3,
      pledgedAmount: 500000,
      pledgedOn: '2026-11-02',
    };

    expect(await errorsOf(CreateVowPledgeDto, valid)).toEqual([]);
    expect(
      (await errorsOf(CreateVowPledgeDto, { ...valid, pledgedAmount: -1 }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      (await errorsOf(CreateVowPledgeDto, { ...valid, dueOn: 'mañana' }))
        .length,
    ).toBeGreaterThan(0);
  });

  it('accept a partial update where null clears the field', async () => {
    expect(await errorsOf(UpdateVowPledgeDto, { dueOn: null })).toEqual([]);
    expect(await errorsOf(UpdateVowPledgeDto, { description: '' })).toEqual([]);
    expect(
      plainToInstance(UpdateVowPledgeDto, { description: '' }).description,
    ).toBeNull();
    expect(plainToInstance(UpdateVowPledgeDto, { dueOn: '' }).dueOn).toBeNull();
    expect(
      (await errorsOf(UpdateVowPledgeDto, { pledgedAmount: 0 })).length,
    ).toBeGreaterThan(0);
  });
});

describe('route permissions', () => {
  const routes = [
    ...routesOf(ContributionsController),
    ...routesOf(ContributorsController),
    ...routesOf(VowPledgesController),
  ];

  function routesOf(controller: { name: string; prototype: object }) {
    const prototype = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype)
      .filter(
        (name) =>
          name !== 'constructor' && typeof prototype[name] === 'function',
      )
      .map((name) => {
        const handler = prototype[name] as object;
        return {
          route: `${controller.name}.${name}`,
          all: Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler) as
            string[] | undefined,
          any: Reflect.getMetadata(REQUIRED_ANY_PERMISSIONS_KEY, handler) as
            string[] | undefined,
        };
      });
  }

  it('declares a permission on every route (nothing is open to any authenticated user)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(15);
    for (const route of routes) {
      expect(route.all ?? route.any, route.route).toBeDefined();
    }
  });

  it('lets read-only roles read and reserves writes for contributions.write', () => {
    const permissionOf = (name: string) =>
      routes.find((r) => r.route === name)?.all;

    expect(permissionOf('ContributionsController.list')).toEqual([
      'contributions.read',
    ]);
    expect(permissionOf('ContributorsController.search')).toEqual([
      'contributions.read',
    ]);
    expect(permissionOf('ContributionsController.record')).toEqual([
      'contributions.write',
    ]);
    expect(permissionOf('ContributionsController.voidOne')).toEqual([
      'contributions.write',
    ]);
    expect(permissionOf('VowPledgesController.create')).toEqual([
      'contributions.write',
    ]);
    expect(permissionOf('VowPledgesController.cancel')).toEqual([
      'contributions.write',
    ]);
    expect(permissionOf('VowPledgesController.update')).toEqual([
      'contributions.write',
    ]);
    expect(permissionOf('VowPledgesController.list')).toEqual([
      'contributions.read',
    ]);
  });
});
