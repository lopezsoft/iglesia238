import { TestBed } from '@angular/core/testing';
import { ApplicationFilter } from '../data/applications.models';
import { ApplicationStatusFilterComponent } from './application-status-filter.component';

describe('ApplicationStatusFilterComponent', () => {
  it('shows the count of every status and emits the chosen one', async () => {
    const fixture = TestBed.createComponent(ApplicationStatusFilterComponent);
    fixture.componentRef.setInput('active', 'PENDING');
    fixture.componentRef.setInput('counts', { PENDING: 3, DUPLICATE: 1, APPROVED: 0, REJECTED: 2, ALL: 6 });
    const chosen: ApplicationFilter[] = [];
    fixture.componentInstance.selected.subscribe((filter) => chosen.push(filter));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(
      tabs.map((tab) => [...tab.querySelectorAll('.tab-card__text > span')].map((part) => part.textContent?.trim())),
    ).toEqual([
      ['Pendientes', '3 solicitudes'],
      ['Duplicadas', '1 solicitud'],
      ['Aprobadas', '0 solicitudes'],
      ['Rechazadas', '2 solicitudes'],
      ['Todas', '6 solicitudes'],
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    tabs[3].click();
    await fixture.whenStable();

    expect(chosen).toEqual(['REJECTED']);
  });
});
