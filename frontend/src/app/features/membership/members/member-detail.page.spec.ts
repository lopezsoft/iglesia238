import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CatalogsRepository } from '../../../core/catalogs/catalogs.repository';
import { CatalogsStore } from '../../../core/catalogs/catalogs.store';
import { DomainError } from '../../../core/errors/domain-error';
import {
  FakeMembersRepository,
  authStub,
  catalogsRepositoryStub,
  catalogsStub,
  memberDetail,
  polyfillDialog,
} from './data/members-testing';
import { MembersRepository } from './data/members.repository';
import { MemberDetailPage } from './member-detail.page';

function render(
  options: {
    permissions?: string[];
    status?: 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';
    repo?: FakeMembersRepository;
  } = {},
) {
  const repo = options.repo ?? new FakeMembersRepository();
  if (!options.repo) {
    repo.detail = () => of(memberDetail({ status: options.status ?? 'ACTIVE' }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MembersRepository, useValue: repo },
      {
        provide: AuthService,
        useValue: authStub({
          permissions: options.permissions ?? [
            'members.read',
            'members.write',
            'certificates.issue',
          ],
        }),
      },
      { provide: CatalogsStore, useValue: catalogsStub() },
      { provide: CatalogsRepository, useValue: catalogsRepositoryStub() },
    ],
  });
  const fixture = TestBed.createComponent(MemberDetailPage);
  fixture.componentRef.setInput('id', '4');
  return { fixture, repo, element: fixture.nativeElement as HTMLElement };
}

const buttons = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
    button.textContent?.includes(label),
  );

describe('MemberDetailPage', () => {
  beforeAll(polyfillDialog);

  it('shows the identity of the member and the sections of the file', async () => {
    const { fixture, element } = render();
    await fixture.whenStable();

    expect(element.querySelector('h1')?.textContent).toContain('Ana María Rojas Díaz');
    expect(element.textContent).toContain('SC-0130');
    expect(element.textContent).toContain('Activo');
    const tabs = Array.from(element.querySelectorAll('[role="tab"]')).map((tab) =>
      tab.textContent?.trim(),
    );
    expect(tabs).toHaveLength(7);
    expect(tabs[0]).toContain('Datos personales');
    expect(element.textContent).toContain('Datos de membresía');
  });

  it('lets a writer edit, change the status and transfer an active member', async () => {
    const { fixture, element } = render();
    await fixture.whenStable();

    for (const label of ['Editar', 'Cambiar estado', 'Trasladar']) {
      const [button] = buttons(element, label);
      expect(button, label).toBeDefined();
      expect(button.disabled, label).toBe(false);
    }
    expect(element.textContent).toContain('Emitir certificado');
  });

  it('does not offer a transfer for an inactive member', async () => {
    const { fixture, element } = render({ status: 'INACTIVE' });
    await fixture.whenStable();

    expect(buttons(element, 'Trasladar')[0].disabled).toBe(true);
    expect(element.textContent).toContain('Solo se trasladan miembros en estado Activo.');
    expect(buttons(element, 'Cambiar estado')[0].disabled).toBe(false);
  });

  it('does not allow changing the status of a deceased member', async () => {
    const { fixture, element } = render({ status: 'DECEASED' });
    await fixture.whenStable();

    expect(buttons(element, 'Cambiar estado')[0].disabled).toBe(true);
  });

  it('hides every write action from a read-only role', async () => {
    const { fixture, element } = render({ permissions: ['members.read'] });
    await fixture.whenStable();

    for (const label of ['Editar', 'Cambiar estado', 'Trasladar', 'Editar membresía']) {
      expect(buttons(element, label), label).toHaveLength(0);
    }
    expect(element.textContent).not.toContain('Emitir certificado');
  });

  it('shows a clear message when the member is not in the scope', async () => {
    const repo = new FakeMembersRepository();
    repo.detail = () =>
      throwError(() => new DomainError('NOT_FOUND', 'No encontramos el miembro.', 404));
    const { fixture, element } = render({ repo });
    await fixture.whenStable();

    expect(element.textContent).toContain('Miembro no encontrado');
    expect(TestBed.inject(Router)).toBeDefined();
  });

  it('switches the section when a card is chosen', async () => {
    const { fixture, element } = render();
    await fixture.whenStable();

    element.querySelector<HTMLButtonElement>('#member-tab-registry')!.click();
    await fixture.whenStable();

    expect(element.textContent).toContain('Registro y traslados');
    expect(element.querySelector('app-registry-tab')).not.toBeNull();
  });
});
