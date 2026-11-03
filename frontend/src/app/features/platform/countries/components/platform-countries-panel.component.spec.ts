import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { CatalogsRepository } from '../../../../core/catalogs/catalogs.repository';
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { DomainError } from '../../../../core/errors/domain-error';
import { PlatformCountryRow } from '../data/platform-countries.models';
import { PlatformCountriesRepository } from '../data/platform-countries.repository';
import { PlatformCountriesPanelComponent } from './platform-countries-panel.component';

const COLOMBIA: PlatformCountryRow = {
  id: 1,
  isoAlpha2: 'CO',
  name: 'Colombia',
  isActive: true,
  hasMunicipalities: true,
  regionCount: 33,
  municipalityCount: 1122,
};
/** Test country registered without municipalities (fixture only). */
const EMPTY: PlatformCountryRow = {
  id: 2,
  isoAlpha2: 'XX',
  name: 'País de prueba',
  isActive: false,
  hasMunicipalities: false,
  regionCount: 0,
  municipalityCount: 0,
};

class FakeCountriesRepository extends PlatformCountriesRepository {
  rows: PlatformCountryRow[] = [EMPTY, COLOMBIA];
  readonly toggled: { id: number; isActive: boolean }[] = [];
  failWith: DomainError | null = null;

  list(): Observable<PlatformCountryRow[]> {
    return of(this.rows);
  }
  setActive(id: number, isActive: boolean): Observable<PlatformCountryRow> {
    this.toggled.push({ id, isActive });
    if (this.failWith) {
      return throwError(() => this.failWith);
    }
    const row = { ...this.rows.find((item) => item.id === id)!, isActive };
    this.rows = this.rows.map((item) => (item.id === id ? row : item));
    return of(row);
  }
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

async function render(canManage = true, repository = new FakeCountriesRepository()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PlatformCountriesRepository, useValue: repository },
      { provide: CatalogsRepository, useValue: { countries: () => of([]) } },
    ],
  });
  const fixture = TestBed.createComponent(PlatformCountriesPanelComponent);
  fixture.componentRef.setInput('canManage', canManage);
  const messages: string[] = [];
  fixture.componentInstance.changed.subscribe((message) => messages.push(message));
  await fixture.whenStable();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const rows = () =>
    Array.from(element.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim()),
    );
  return { fixture, element, repository, messages, rows };
}

describe('PlatformCountriesPanelComponent', () => {
  it('lists every country by name with its ISO code, counters, municipalities badge and status', async () => {
    const { element, rows } = await render();

    expect(Array.from(element.querySelectorAll('th')).map((th) => th.textContent?.trim())).toEqual([
      'País',
      'ISO',
      'Departamentos / regiones',
      'Municipios',
      'Municipios cargados',
      'Estado',
      'Acciones',
    ]);
    expect(rows().map((cells) => cells.slice(0, 6))).toEqual([
      ['Colombia', 'CO', '33', '1122', 'Cargados', 'Activo'],
      ['País de prueba', 'XX', '0', '0', 'Sin municipios', 'Inactivo'],
    ]);
  });

  it('filters by status and by name or ISO code', async () => {
    const { element, fixture, rows } = await render();

    const status = element.querySelector<HTMLSelectElement>('#country-status')!;
    expect(Array.from(status.options).map((option) => option.textContent?.trim())).toEqual(['Activos', 'Todos']);
    status.value = 'active';
    status.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows().map((cells) => cells[0])).toEqual(['Colombia']);

    status.value = 'all';
    status.dispatchEvent(new Event('change'));
    const search = element.querySelector<HTMLInputElement>('#country-search')!;
    search.value = 'xx';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows().map((cells) => cells[0])).toEqual(['País de prueba']);
  });

  it('asks for confirmation, changes the status and refreshes the country selects', async () => {
    const { element, fixture, repository, messages, rows } = await render();
    const forget = vi.spyOn(TestBed.inject(CatalogsStore), 'forgetCountries');

    element.querySelector<HTMLButtonElement>('[aria-label="Activar País de prueba"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = element.querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('¿Activar el país?');
    expect(repository.toggled).toEqual([]);

    Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Activar')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(repository.toggled).toEqual([{ id: 2, isActive: true }]);
    expect(messages).toEqual(['País «País de prueba» activado.']);
    expect(forget).toHaveBeenCalled();
    expect(rows()[1][5]).toBe('Activo');
  });

  it('shows the API message when the country is still in use', async () => {
    const repository = new FakeCountriesRepository();
    repository.failWith = new DomainError('COUNTRY_IN_USE', 'Hay razones sociales activas en este país.', 409);
    const { element, fixture, messages } = await render(true, repository);

    element.querySelector<HTMLButtonElement>('[aria-label="Desactivar Colombia"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = element.querySelector('app-confirm-dialog')!;
    Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Desactivar')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Hay razones sociales activas en este país.');
    expect(messages).toEqual([]);
  });

  it('offers no action without the permission', async () => {
    const { element } = await render(false);

    expect(element.querySelectorAll('tbody button')).toHaveLength(0);
  });
});
