import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { AuthGateway } from '../../core/auth/auth.gateway';
import { DemoAuthGateway } from '../../core/auth/demo-auth.gateway';
import { DomainError } from '../../core/errors/domain-error';
import { DashboardPage } from './dashboard.page';
import { DashboardSummary } from './data/dashboard.models';
import { DashboardRepository } from './data/dashboard.repository';

class FailingDashboardRepository extends DashboardRepository {
  summary(): Observable<DashboardSummary> {
    return throwError(() => new DomainError('UNAUTHENTICATED', 'Inicia sesión para ver el resumen.'));
  }
}

describe('DashboardPage', () => {
  it('shows the error banner with a retry when the summary fails to load', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthGateway, useClass: DemoAuthGateway },
        { provide: DashboardRepository, useClass: FailingDashboardRepository },
      ],
    });
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const banner = element.querySelector('app-error-banner');
    expect(banner?.textContent).toContain('Inicia sesión para ver el resumen.');
    expect(banner?.querySelector('button')?.textContent).toContain('Reintentar');
    expect(element.querySelector('app-role-summary')).not.toBeNull();
  });
});
