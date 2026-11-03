import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buildDetail, buildMatch } from '../testing/application-builders';
import { ApplicationDetailComponent } from './application-detail.component';

async function render(inputs: Parameters<typeof buildDetail>[0] = {}, canReview = true) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ApplicationDetailComponent);
  fixture.componentRef.setInput('application', buildDetail(inputs));
  fixture.componentRef.setInput('canReview', canReview);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const outputs = {
    approve: vi.fn(),
    approveLinked: vi.fn(),
    markDuplicate: vi.fn(),
    reject: vi.fn(),
  };
  fixture.componentInstance.approve.subscribe(outputs.approve);
  fixture.componentInstance.approveLinked.subscribe(outputs.approveLinked);
  fixture.componentInstance.markDuplicate.subscribe(outputs.markDuplicate);
  fixture.componentInstance.reject.subscribe(outputs.reject);
  return { fixture, element, outputs };
}

function button(element: HTMLElement, label: string): HTMLButtonElement {
  const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!found) {
    throw new Error(`No button "${label}"`);
  }
  return found;
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

describe('ApplicationDetailComponent', () => {
  it('shows the applicant data without any tracking code', async () => {
    const { element } = await render();

    expect(element.textContent).toContain('Ana Pérez Gómez');
    expect(element.textContent).toContain('Cartagena, Bolívar');
    expect(element.textContent).toContain('Docente');
    expect(element.textContent).not.toContain('Código de seguimiento');
  });

  it('approves directly when the document is free', async () => {
    const { fixture, element, outputs } = await render();

    button(element, 'Aprobar y crear miembro').click();
    await fixture.whenStable();

    expect(outputs.approve).toHaveBeenCalledOnce();
  });

  it('blocks the plain approval while a person already holds the document', async () => {
    const { element } = await render({ duplicateMatch: buildMatch() });

    expect(button(element, 'Aprobar y crear miembro').disabled).toBe(true);
    expect(element.textContent).toContain('Este documento ya está registrado');
  });

  it('approves on top of an existing person only after the reviewer confirms', async () => {
    const { fixture, element, outputs } = await render({ duplicateMatch: buildMatch() });

    button(element, 'Aprobar sobre esta persona').click();
    await fixture.whenStable();
    expect(outputs.approveLinked).not.toHaveBeenCalled();
    expect(element.querySelector('dialog')?.textContent).toContain('No se crea otra persona');

    button(element, 'Confirmar y aprobar').click();
    await fixture.whenStable();

    expect(outputs.approveLinked).toHaveBeenCalledWith(50);
  });

  it('offers to readmit a former member and explains it', async () => {
    const { element } = await render({
      duplicateMatch: buildMatch({
        memberId: 3,
        memberCode: 'SC-0003',
        memberStatus: 'INACTIVE',
        congregationName: 'Sede Norte',
      }),
    });

    expect(button(element, 'Readmitir a esta persona')).toBeTruthy();
    expect(element.textContent).toContain('SC-0003');
  });

  it('does not offer to link an active member: it can only be marked as duplicate', async () => {
    const { fixture, element, outputs } = await render({
      duplicateMatch: buildMatch({ memberId: 3, memberCode: 'SC-0003', memberStatus: 'ACTIVE' }),
    });

    expect(() => button(element, 'Readmitir')).toThrow();
    expect(() => button(element, 'Aprobar sobre esta persona')).toThrow();
    button(element, 'Marcar como duplicada').click();
    await fixture.whenStable();

    expect(outputs.markDuplicate).toHaveBeenCalledWith(50);
  });

  it('says the rejection reason is an internal note', async () => {
    const { element } = await render({
      status: 'REJECTED',
      rejectionReason: 'El documento no coincide.',
      reviewedAt: '2026-11-02T10:00:00.000Z',
      reviewerName: 'Laura Gómez',
    });

    expect(element.textContent).toContain('Motivo (nota interna): El documento no coincide.');
    expect(element.textContent).toContain('El solicitante solo ve que no fue aprobada');
  });

  it('shows the guardian of a minor', async () => {
    const { element } = await render({
      isMinor: true,
      age: 12,
      guardianName: 'Marta Ruiz',
      guardianDocument: '52345678',
      formData: { ...buildDetail().formData, guardianRelationship: 'Madre', guardianDocumentTypeCode: 'CC' },
    });

    expect(element.textContent).toContain('Marta Ruiz');
    expect(element.textContent).toContain('CC 52345678');
    expect(element.textContent).toContain('Madre');
  });

  it('is read only without the review permission', async () => {
    const { element } = await render({}, false);

    expect(element.textContent).toContain('Solo lectura');
    expect(() => button(element, 'Aprobar y crear miembro')).toThrow();
  });
});
