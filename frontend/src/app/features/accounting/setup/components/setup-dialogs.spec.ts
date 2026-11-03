import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DomainError } from '../../../../core/errors/domain-error';
import { PeriodRow, TitheRuleRow } from '../data/accounting-setup.models';
import { AccountingSetupRepository } from '../data/accounting-setup.repository';
import { OpenPeriodDialogComponent } from './open-period-dialog.component';
import { TitheRuleFormDialogComponent } from './tithe-rule-form-dialog.component';

function period(month: number, status: 'OPEN' | 'CLOSED' = 'OPEN'): PeriodRow {
  return {
    id: month,
    year: 2026,
    month,
    status,
    label: `Mes ${month} 2026`,
    closedAt: null,
    from: `2026-${String(month).padStart(2, '0')}-01`,
    to: `2026-${String(month).padStart(2, '0')}-28`,
  };
}

function provide(repository: Partial<AccountingSetupRepository>): void {
  TestBed.configureTestingModule({
    providers: [{ provide: AccountingSetupRepository, useValue: repository }],
  });
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

describe('TitheRuleFormDialogComponent', () => {
  async function render(rule: TitheRuleRow | null = null) {
    const saveTitheRule = vi.fn((command: { id: number | null }) =>
      of({ denominationId: 1, inForce: true, inUse: false, ...command, id: command.id ?? 1 } as unknown as TitheRuleRow),
    );
    provide({ saveTitheRule });
    const fixture = TestBed.createComponent(TitheRuleFormDialogComponent);
    fixture.componentRef.setInput('today', '2026-11-02');
    fixture.componentRef.setInput('rule', rule);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance as unknown as {
      form: { setValue(value: { effectiveFrom: string; national: number; local: number }): void; getRawValue(): { effectiveFrom: string; national: number; local: number } };
      submit(): Promise<void>;
      error(): string | null;
      example(): { national: number; local: number; pastor: number } | null;
    };
    return { fixture, component, saveTitheRule };
  }

  it('starts empty on today: there is no default percentage', async () => {
    const { component } = await render();

    expect(component.form.getRawValue()).toEqual({ effectiveFrom: '2026-11-02', national: 0, local: 0 });
  });

  it('sends the typed percentages as fractions', async () => {
    const { fixture, component, saveTitheRule } = await render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    component.form.setValue({ effectiveFrom: '2026-01-01', national: 21, local: 3 });

    await component.submit();

    expect(saveTitheRule).toHaveBeenCalledWith({
      id: null,
      effectiveFrom: '2026-01-01',
      nationalShareRate: 0.21,
      localFundRate: 0.03,
    });
    expect(saved).toHaveBeenCalled();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('loads the rule being edited as percentages', async () => {
    const { component } = await render({
      id: 4,
      denominationId: 1,
      effectiveFrom: '2025-06-01',
      nationalShareRate: 0.1225,
      localFundRate: 0.3,
      inForce: false,
      inUse: false,
    });

    expect(component.form.getRawValue()).toEqual({ effectiveFrom: '2025-06-01', national: 12.25, local: 30 });
  });

  it('does not submit percentages out of range or with more than two decimals', async () => {
    const { component, saveTitheRule } = await render();

    component.form.setValue({ effectiveFrom: '2026-01-01', national: 120, local: 3 });
    await component.submit();
    component.form.setValue({ effectiveFrom: '2026-01-01', national: 21.123, local: 3 });
    await component.submit();

    expect(saveTitheRule).not.toHaveBeenCalled();
  });

  it('shows the effect of the percentages on a sample tithe', async () => {
    const { component } = await render();
    component.form.setValue({ effectiveFrom: '2026-01-01', national: 21, local: 3 });

    // 1.000.000 − 210.000 = 790.000; 3 % of that is 23.700.
    expect(component.example()).toEqual({ national: 210_000, local: 23_700, pastor: 766_300 });
  });

  it('shows the message of the API when the rule is rejected', async () => {
    const saveTitheRule = vi.fn(() => throwError(() => new DomainError('RULE_DATE_TAKEN', 'Ya existe un porcentaje con esa fecha de inicio.')));
    provide({ saveTitheRule });
    const fixture = TestBed.createComponent(TitheRuleFormDialogComponent);
    fixture.componentRef.setInput('today', '2026-11-02');
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance as unknown as {
      form: { setValue(value: { effectiveFrom: string; national: number; local: number }): void };
      submit(): Promise<void>;
      error(): string | null;
    };
    component.form.setValue({ effectiveFrom: '2026-01-01', national: 21, local: 3 });

    await component.submit();

    expect(component.error()).toBe('Ya existe un porcentaje con esa fecha de inicio.');
    expect(fixture.componentInstance.open()).toBe(true);
  });
});

describe('OpenPeriodDialogComponent', () => {
  async function render(periods: readonly PeriodRow[], currentMonth = 11) {
    const openPeriod = vi.fn((command: { month: number }) => of(period(command.month)));
    provide({ openPeriod });
    const fixture = TestBed.createComponent(OpenPeriodDialogComponent);
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('currentMonth', currentMonth);
    fixture.componentRef.setInput('periods', periods);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance as unknown as {
      form: { getRawValue(): { month: number } };
      months(): { month: number; exists: boolean }[];
      submit(): Promise<void>;
    };
    return { fixture, component, openPeriod };
  }

  it('proposes the current month to a sede without periods and opens it', async () => {
    const { fixture, component, openPeriod } = await render([]);
    const opened = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);

    expect(component.form.getRawValue().month).toBe(11);
    expect(component.months()).toHaveLength(11);

    await component.submit();

    expect(openPeriod).toHaveBeenCalledWith({ year: 2026, month: 11 });
    expect(opened).toHaveBeenCalled();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('proposes the month after the last period and marks the existing ones', async () => {
    const { component } = await render([period(10), period(9, 'CLOSED')], 11);

    expect(component.form.getRawValue().month).toBe(11);
    expect(component.months().filter((m) => m.exists).map((m) => m.month)).toEqual([9, 10]);
  });

  it('proposes the month before the first one when the range already reaches the current month', async () => {
    const { component } = await render([period(11), period(10)], 11);

    expect(component.form.getRawValue().month).toBe(9);
  });
});
