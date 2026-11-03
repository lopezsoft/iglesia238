import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { CatalogsRepository } from '../../../core/catalogs/catalogs.repository';
import { CatalogsStore } from '../../../core/catalogs/catalogs.store';
import {
  FakeMembersRepository,
  SEDE_CENTRAL,
  SEDE_NORTE,
  authStub,
  catalogsRepositoryStub,
  catalogsStub,
  polyfillDialog,
} from './data/members-testing';
import { MembersRepository } from './data/members.repository';
import { MembersPage } from './members.page';

const DENOMINATION: typeof SEDE_CENTRAL = {
  kind: 'DENOMINATION',
  denominationId: 1,
  congregationId: null,
  label: 'Monte de Sion',
};

function render(options: { permissions?: string[]; wide?: boolean } = {}) {
  const repo = new FakeMembersRepository();
  const saved: Array<{ blob: Blob; filename: string }> = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MembersRepository, useValue: repo },
      {
        provide: AuthService,
        useValue: authStub({
          permissions: options.permissions,
          scope: options.wide ? DENOMINATION : SEDE_CENTRAL,
          scopes: options.wide ? [DENOMINATION, SEDE_CENTRAL, SEDE_NORTE] : [SEDE_CENTRAL],
        }),
      },
      { provide: CatalogsStore, useValue: catalogsStub() },
      { provide: CatalogsRepository, useValue: catalogsRepositoryStub() },
      {
        provide: FileDownloadService,
        useValue: { save: (blob: Blob, filename: string) => saved.push({ blob, filename }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MembersPage);
  return { fixture, repo, saved, element: fixture.nativeElement as HTMLElement };
}

describe('MembersPage', () => {
  beforeAll(polyfillDialog);

  it('asks the server for the first page and shows the rows and the counts per status', async () => {
    const { fixture, repo, element } = render();
    await fixture.whenStable();

    expect(repo.queries[0]).toMatchObject({
      page: 1,
      pageSize: 10,
      status: 'ALL',
      sortBy: 'name',
      order: 'asc',
      congregationId: null,
    });
    expect(element.textContent).toContain('SC-0130');
    expect(element.textContent).toContain('Ana María Rojas Díaz');
    expect(element.textContent).toContain('CC 52418916');
    expect(element.textContent).toContain('20 miembros');
    expect(element.textContent).toContain('1–10 de 25');
  });

  it('goes back to the first page and sends the status when a status card is chosen', async () => {
    const { fixture, repo, element } = render();
    await fixture.whenStable();
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Siguiente'))!
      .click();
    await fixture.whenStable();
    expect(repo.queries.at(-1)?.page).toBe(2);

    element.querySelector<HTMLButtonElement>('#members-status-tab-INACTIVE')!.click();
    await fixture.whenStable();

    expect(repo.queries.at(-1)).toMatchObject({ page: 1, status: 'INACTIVE' });
  });

  it('sends the text, the sex and the sort chosen by the user', async () => {
    const { fixture, repo, element } = render();
    await fixture.whenStable();

    const search = element.querySelector<HTMLInputElement>('#member-search')!;
    search.value = 'rojas';
    search.dispatchEvent(new Event('input'));
    const sex = element.querySelector<HTMLSelectElement>('#filter-sex')!;
    sex.value = 'FEMALE';
    sex.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(repo.queries.at(-1)).toMatchObject({ text: 'rojas', sex: 'FEMALE', page: 1 });

    element.querySelector<HTMLButtonElement>('.members__sort')!.click();
    await fixture.whenStable();
    expect(repo.queries.at(-1)).toMatchObject({ sortBy: 'name', order: 'desc' });
  });

  it('offers the sede filter only to someone acting on the whole denomination', async () => {
    const narrow = render();
    await narrow.fixture.whenStable();
    expect(narrow.element.querySelector('#filter-congregation')).toBeNull();
    TestBed.resetTestingModule();

    const { fixture, repo, element } = render({ wide: true });
    await fixture.whenStable();
    const select = element.querySelector<HTMLSelectElement>('#filter-congregation')!;
    expect(select).not.toBeNull();
    select.value = '11';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(repo.queries.at(-1)?.congregationId).toBe(11);
    expect(element.textContent).toContain('Sede');
  });

  it('exports the filtered list through the download service', async () => {
    const { fixture, repo, saved, element } = render();
    await fixture.whenStable();

    element.querySelector<HTMLButtonElement>('button[aria-label="Descargar en CSV"]')!.click();
    await fixture.whenStable();

    expect(repo.exports).toHaveLength(1);
    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toMatch(/^miembros-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(element.textContent).toContain('Se descargó el listado de miembros.');
  });

  it('hides the registration and the export from a role that cannot write members', async () => {
    const { fixture, element } = render({ permissions: ['members.read'] });
    await fixture.whenStable();

    expect(element.textContent).not.toContain('Registrar miembro');
    expect(element.querySelector('button[aria-label="Descargar en CSV"]')).toBeNull();
    expect(element.textContent).toContain('Ver ficha');
  });
});
