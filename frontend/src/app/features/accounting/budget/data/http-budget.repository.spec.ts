import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { BudgetLineRow, SaveBudgetLineCommand } from './budget.models';
import { BudgetRepository } from './budget.repository';
import { HttpBudgetRepository } from './http-budget.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BudgetRepository, useClass: HttpBudgetRepository }],
  });
  return { repo: TestBed.inject(BudgetRepository), backend: TestBed.inject(HttpTestingController) };
}

const LINE: BudgetLineRow = {
  id: 5,
  budgetId: 2,
  accountId: 3,
  accountCode: '510505',
  accountName: 'Servicios públicos',
  nature: 'EXPENSE',
  fundId: 1,
  fundName: 'Fondo Local',
  monthlyAmount: null,
  annualAmount: 1_200_000,
  executed: 300_000,
  executionPct: 25,
  overExecuted: false,
  difference: 900_000,
  sharedWith: [],
};

const COMMAND: SaveBudgetLineCommand = {
  id: null,
  year: 2026,
  type: 'FIXED',
  accountId: 3,
  fundId: 1,
  annualAmount: 1_200_000,
  monthlyAmount: null,
};

describe('HttpBudgetRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the overview of the current year or of a chosen one', async () => {
    const { repo, backend } = setup();

    const current = firstValueFrom(repo.overview(null));
    const first = backend.expectOne((req) => req.url === '/api/accounting/budgets/overview');
    expect(first.request.params.keys()).toEqual([]);
    first.flush({ year: 2026 });
    expect((await current).year).toBe(2026);

    const chosen = firstValueFrom(repo.overview(2025));
    const second = backend.expectOne((req) => req.url === '/api/accounting/budgets/overview');
    expect(second.request.params.get('year')).toBe('2025');
    second.flush({ year: 2025 });
    await chosen;
  });

  it('creates a line with POST and does not send a null id', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.saveLine(COMMAND));
    const request = backend.expectOne('/api/accounting/budgets/lines');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      year: 2026,
      type: 'FIXED',
      accountId: 3,
      fundId: 1,
      annualAmount: 1_200_000,
      monthlyAmount: null,
    });
    request.flush(LINE);

    expect((await result).id).toBe(5);
  });

  it('edits a line with PUT on its id', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.saveLine({ ...COMMAND, id: 5, annualAmount: 1_500_000 }));
    const request = backend.expectOne('/api/accounting/budgets/lines/5');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).not.toHaveProperty('id');
    expect(request.request.body.annualAmount).toBe(1_500_000);
    request.flush({ ...LINE, annualAmount: 1_500_000 });

    expect((await result).annualAmount).toBe(1_500_000);
  });

  it('deletes a line and reads its detail', async () => {
    const { repo, backend } = setup();

    const deleted = firstValueFrom(repo.deleteLine(5));
    const remove = backend.expectOne('/api/accounting/budgets/lines/5');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
    await deleted;

    const detail = firstValueFrom(repo.lineDetail(5));
    const read = backend.expectOne('/api/accounting/budgets/lines/5');
    expect(read.request.method).toBe('GET');
    read.flush({ line: LINE, year: 2026, type: 'FIXED', status: 'DRAFT', months: [], movements: [] });
    expect((await detail).line.id).toBe(5);
  });

  it('changes the status, the income rate and copies a budget', async () => {
    const { repo, backend } = setup();

    const status = firstValueFrom(repo.changeStatus(2, 'APPROVED'));
    const statusRequest = backend.expectOne('/api/accounting/budgets/2/status');
    expect(statusRequest.request.method).toBe('PATCH');
    expect(statusRequest.request.body).toEqual({ status: 'APPROVED' });
    statusRequest.flush({ id: 2, year: 2026, type: 'FIXED', status: 'APPROVED', incomeIncreaseRate: null });
    expect((await status).status).toBe('APPROVED');

    const rate = firstValueFrom(repo.setIncomeIncreaseRate(2, 0.05));
    const rateRequest = backend.expectOne('/api/accounting/budgets/2');
    expect(rateRequest.request.method).toBe('PATCH');
    expect(rateRequest.request.body).toEqual({ incomeIncreaseRate: 0.05 });
    rateRequest.flush({ id: 2, year: 2026, type: 'FIXED', status: 'APPROVED', incomeIncreaseRate: 0.05 });
    expect((await rate).incomeIncreaseRate).toBe(0.05);

    const copy = firstValueFrom(repo.copy({ type: 'FIXED', sourceYear: 2025, targetYear: 2026, adjustmentRate: 0.1 }));
    const copyRequest = backend.expectOne('/api/accounting/budgets/copy');
    expect(copyRequest.request.method).toBe('POST');
    expect(copyRequest.request.body).toEqual({ type: 'FIXED', sourceYear: 2025, targetYear: 2026, adjustmentRate: 0.1 });
    copyRequest.flush({ budgetId: 9, copied: 4, skipped: 1 });
    expect(await copy).toEqual({ budgetId: 9, copied: 4, skipped: 1 });
  });
});
