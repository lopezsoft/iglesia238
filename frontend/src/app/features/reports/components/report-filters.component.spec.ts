import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { ReportOptions, ReportQuery } from '../data/reports.models';
import { ReportFiltersComponent, rangeValidator } from './report-filters.component';

function errorsOf(from: string, to: string) {
  return rangeValidator(new FormGroup({ from: new FormControl(from), to: new FormControl(to) }));
}

describe('rangeValidator', () => {
  it('accepts a YYYY-MM-DD range inside one year', () => {
    expect(errorsOf('2026-01-01', '2026-12-31')).toBeNull();
  });

  it('rejects years the API rejects (a date input accepts more than four digits)', () => {
    expect(errorsOf('20260-01-01', '20260-12-31')).toEqual({ invalidDate: true });
    expect(errorsOf('2026-01-01', '20260-12-31')).toEqual({ invalidDate: true });
  });

  it('rejects reversed ranges and ranges spanning two years', () => {
    expect(errorsOf('2026-10-31', '2026-10-01')).toEqual({ reversed: true });
    expect(errorsOf('2025-12-01', '2026-01-31')).toEqual({ crossesYear: true });
  });
});

describe('ReportFiltersComponent', () => {
  function render(congregations: ReportOptions['congregations'] = []) {
    const fixture = TestBed.createComponent(ReportFiltersComponent);
    fixture.componentRef.setInput('options', {
      scopeLabel: 'Monte de Sión (todas las sedes)',
      denominationWide: congregations.length > 0,
      funds: [{ id: 1, name: 'Fondo Local', isActive: true }],
      congregations,
      today: '2026-11-02',
    } satisfies ReportOptions);
    fixture.componentRef.setInput('query', { from: '2026-01-01', to: '2026-12-31', fundId: null, congregationId: null });
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('shows the fixed scope when the session is on one sede', () => {
    const { element } = render();

    expect(element.querySelector('#report-scope')).not.toBeNull();
    expect(element.querySelector('#report-congregation')).toBeNull();
  });

  it('lets a denomination session narrow the report to one sede', () => {
    const { fixture, element } = render([
      { id: 10, name: 'Sede Central', isActive: true },
      { id: 11, name: 'Sede Norte', isActive: true },
    ]);
    const applied: ReportQuery[] = [];
    fixture.componentInstance.apply.subscribe((query) => applied.push(query));

    const select = element.querySelector<HTMLSelectElement>('#report-congregation')!;
    select.value = '11';
    select.dispatchEvent(new Event('change'));
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    expect(applied).toEqual([{ from: '2026-01-01', to: '2026-12-31', fundId: null, congregationId: 11 }]);
  });

  it('does not emit an invalid range', () => {
    const { fixture, element } = render();
    const applied: ReportQuery[] = [];
    fixture.componentInstance.apply.subscribe((query) => applied.push(query));

    const from = element.querySelector<HTMLInputElement>('#report-from')!;
    from.value = '2026-12-31';
    from.dispatchEvent(new Event('input'));
    const to = element.querySelector<HTMLInputElement>('#report-to')!;
    to.value = '2026-01-01';
    to.dispatchEvent(new Event('input'));
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(applied).toEqual([]);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('no puede ser posterior');
  });
});
