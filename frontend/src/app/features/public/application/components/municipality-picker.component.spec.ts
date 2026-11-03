import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { Observable, of } from 'rxjs';
import {
  ApplicationStatusCheck,
  ApplicationSubmission,
  CurrentPrivacyPolicy,
  MunicipalityFilter,
  MunicipalityOption,
  OpenCongregation,
  PublicCatalogs,
  SubmissionReceipt,
} from '../data/public-application.models';
import { PublicApplicationRepository } from '../data/public-application.repository';
import { MunicipalityPickerComponent } from './municipality-picker.component';

class FakeRepository extends PublicApplicationRepository {
  readonly searches: string[] = [];
  readonly filters: (MunicipalityFilter | undefined)[] = [];

  searchMunicipalities(text: string, filter?: MunicipalityFilter): Observable<MunicipalityOption[]> {
    if (filter?.limit === 1) {
      // Availability check of a country: only the country with id 1 has municipalities here.
      return of(filter.countryId === 1 ? [{ code: '13001', name: 'Cartagena', regionName: 'Bolívar' }] : []);
    }
    this.searches.push(text);
    this.filters.push(filter);
    return of([
      { code: '13001', name: 'Cartagena', regionName: 'Bolívar' },
      { code: '13430', name: 'Magangué', regionName: 'Bolívar' },
    ]);
  }
  listOpenCongregations(): Observable<OpenCongregation[]> {
    return of([]);
  }
  getCurrentPolicy(): Observable<CurrentPrivacyPolicy> {
    throw new Error('not used');
  }
  getCatalogs(): Observable<PublicCatalogs> {
    throw new Error('not used');
  }
  submit(_input: ApplicationSubmission): Observable<SubmissionReceipt> {
    throw new Error('not used');
  }
  checkStatus(): Observable<ApplicationStatusCheck> {
    throw new Error('not used');
  }
}

@Component({
  imports: [MunicipalityPickerComponent],
  template: `<app-municipality-picker
    [codeControl]="code"
    [nameControl]="name"
    [countryId]="countryId"
    (availabilityChange)="available = $event"
  />`,
})
class HostComponent {
  readonly code = new FormControl('', { nonNullable: true });
  readonly name = new FormControl('', { nonNullable: true });
  countryId: number | null = null;
  available: boolean | null = null;
}

async function render(countryId: number | null = null) {
  TestBed.configureTestingModule({
    providers: [{ provide: PublicApplicationRepository, useClass: FakeRepository }],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.countryId = countryId;
  await fixture.whenStable();
  return {
    fixture,
    host: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    repository: TestBed.inject(PublicApplicationRepository) as FakeRepository,
  };
}

async function type(fixture: Awaited<ReturnType<typeof render>>['fixture'], value: string) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 320));
  await fixture.whenStable();
}

describe('MunicipalityPickerComponent', () => {
  it('does not search before two letters', async () => {
    const { fixture, repository, element } = await render();

    await type(fixture, 'c');

    expect(repository.searches).toEqual([]);
    expect(element.querySelector('[role="listbox"]')).toBeNull();
  });

  it('searches once the typing pauses and lists the results with their department', async () => {
    const { fixture, repository, element } = await render();

    await type(fixture, 'car');

    expect(repository.searches).toEqual(['car']);
    // The member application searches every country.
    expect(repository.filters).toEqual([undefined]);
    const options = [...element.querySelectorAll('[role="option"]')];
    expect(options.map((option) => [...option.querySelectorAll('span')].map((part) => part.textContent?.trim()))).toEqual([
      ['Cartagena', 'Bolívar'],
      ['Magangué', 'Bolívar'],
    ]);
  });

  it('searches only in the given country', async () => {
    const { fixture, repository, element } = await render(1);

    await type(fixture, 'car');

    expect(repository.filters).toEqual([{ countryId: 1 }]);
    expect(element.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(fixture.componentInstance.available).toBe(true);
  });

  it('explains that a country has no municipalities instead of offering the search', async () => {
    const { fixture, element } = await render(2);
    fixture.detectChanges();

    const input = element.querySelector<HTMLInputElement>('input')!;
    expect(input.disabled).toBe(true);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('No hay municipios cargados para este país.');
    expect(input.getAttribute('aria-describedby')).toBe(element.querySelector('[role="status"]')?.id);
    expect(fixture.componentInstance.available).toBe(false);
  });

  it('keeps the code in the form and shows the choice, until the person changes it', async () => {
    const { fixture, host, element } = await render();
    await type(fixture, 'car');

    element.querySelector('[role="option"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();

    expect(host.code.value).toBe('13001');
    expect(host.name.value).toBe('Cartagena (Bolívar)');
    expect(element.querySelector('.picked__label')?.textContent).toContain('Cartagena (Bolívar)');
    expect(element.querySelector('input')).toBeNull();

    element.querySelector<HTMLButtonElement>('.picked button')!.click();
    await fixture.whenStable();

    expect(host.code.value).toBe('');
    expect(host.name.value).toBe('');
    expect(element.querySelector('input')).not.toBeNull();
  });
});
