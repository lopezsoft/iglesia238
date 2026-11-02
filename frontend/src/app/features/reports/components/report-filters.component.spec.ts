import { FormControl, FormGroup } from '@angular/forms';
import { rangeValidator } from './report-filters.component';

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
