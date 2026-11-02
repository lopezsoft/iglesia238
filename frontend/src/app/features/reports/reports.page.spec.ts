import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthGateway } from '../../core/auth/auth.gateway';
import { DemoAuthGateway } from '../../core/auth/demo-auth.gateway';
import { DomainError } from '../../core/errors/domain-error';
import {
  ContributionDetailRow,
  FinancialReport,
  ReportOptions,
} from './data/reports.models';
import { ReportsRepository } from './data/reports.repository';
import { ReportsPage } from './reports.page';

class FailingReportsRepository extends ReportsRepository {
  options(): Observable<ReportOptions> {
    return of({ scopeLabel: 'Sede Central', denominationWide: false, funds: [], today: '2026-11-02' });
  }

  financialReport(): Observable<FinancialReport> {
    return throwError(
      () => new DomainError('INVALID_RANGE', 'Indica fechas válidas en «Desde» y «Hasta».'),
    );
  }

  contributionDetail(): Observable<ContributionDetailRow[]> {
    return NEVER;
  }
}

describe('ReportsPage', () => {
  it('shows the error banner with a retry when the report fails to load', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthGateway, useClass: DemoAuthGateway },
        { provide: ReportsRepository, useClass: FailingReportsRepository },
      ],
    });
    const fixture = TestBed.createComponent(ReportsPage);
    await fixture.whenStable();

    const banner = (fixture.nativeElement as HTMLElement).querySelector('app-error-banner');
    expect(banner?.textContent).toContain('Indica fechas válidas en «Desde» y «Hasta».');
    expect(banner?.querySelector('button')?.textContent).toContain('Reintentar');
  });
});
