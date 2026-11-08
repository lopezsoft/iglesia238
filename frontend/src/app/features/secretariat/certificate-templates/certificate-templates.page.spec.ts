import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../core/errors/domain-error';
import {
  CertificateTypeChanges,
  CertificateTypeTemplate,
  TemplateCatalog,
  TemplatePreview,
} from './data/certificate-templates.models';
import { CertificateTemplatesRepository } from './data/certificate-templates.repository';
import { CertificateTemplatesPage } from './certificate-templates.page';

const MEM: CertificateTypeTemplate = {
  id: 1,
  code: 'MEM',
  name: 'Certificado de membresía',
  validityDays: null,
  template: null,
  introTemplate: 'La {{denomination}} certifica que',
  closingTemplate: null,
  pastorTitleTemplate: null,
  secretaryTitleTemplate: null,
};
const TRA: CertificateTypeTemplate = {
  ...MEM,
  id: 2,
  code: 'TRA',
  name: 'Carta de traslado',
  introTemplate: null,
  validityDays: 90,
};

const CATALOG: TemplateCatalog = {
  types: [MEM, TRA],
  placeholders: [
    { key: 'memberName', description: 'Nombre completo del miembro' },
    { key: 'city', description: 'Ciudad de la sede' },
  ],
  defaults: {
    intro: 'La Secretaría de {{sede}} hace constar',
    closing: 'Se expide en {{city}}, el {{issuedOn}}.',
    pastorTitle: 'Pastor(a), {{congregation}}',
    secretaryTitle: 'Secretario(a), {{congregation}}',
  },
};

const SHEET: TemplatePreview = {
  title: 'CERTIFICADO DE MEMBRESÍA',
  intro: 'La Su denominación certifica que',
  body: 'María Fernanda Pérez Gómez es miembro.',
  closing: 'Se expide en Bogotá.',
  pastorName: 'Pastor(a) de ejemplo',
  pastorTitle: 'Pastor(a), Sede Central',
  secretaryName: 'Secretario(a) de ejemplo',
  secretaryTitle: 'Secretario(a), Sede Central',
};

class FakeRepository extends CertificateTemplatesRepository {
  readonly saved: { id: number; changes: CertificateTypeChanges }[] = [];
  readonly previewed: { id: number; changes: CertificateTypeChanges }[] = [];
  catalogResponse: Observable<TemplateCatalog> = of(CATALOG);
  saveResponse: Observable<CertificateTypeTemplate> | null = null;
  previewResponse: Observable<TemplatePreview> = of(SHEET);

  catalog() {
    return this.catalogResponse;
  }
  save(id: number, changes: CertificateTypeChanges) {
    this.saved.push({ id, changes });
    return (
      this.saveResponse ??
      of({
        ...MEM,
        id,
        ...changes,
        template: changes.template || null,
        introTemplate: changes.introTemplate || null,
      })
    );
  }
  preview(id: number, changes: CertificateTypeChanges) {
    this.previewed.push({ id, changes });
    return this.previewResponse;
  }
}

/** Lets the pending promises of the page (catalog, preview) resolve and paints the result. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

async function render(repository = new FakeRepository()) {
  TestBed.configureTestingModule({
    providers: [{ provide: CertificateTemplatesRepository, useValue: repository }],
  });
  const fixture = TestBed.createComponent(CertificateTemplatesPage);
  fixture.detectChanges();
  await settle(fixture);
  const host = fixture.nativeElement as HTMLElement;
  const field = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  const type = (id: string, value: string) => {
    const element = field<HTMLTextAreaElement | HTMLInputElement>(id);
    element.value = value;
    element.dispatchEvent(new Event('input'));
  };
  const click = (label: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    );
    if (!button) {
      throw new Error(`No button "${label}"`);
    }
    button.click();
  };
  const submit = async () => {
    host.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };
  return {
    fixture,
    repository,
    host,
    field,
    type,
    click,
    submit,
    text: () => host.textContent ?? '',
  };
}

describe('CertificateTemplatesPage', () => {
  it('loads the types, selects the first one and shows its texts and a preview', async () => {
    const { host, field, repository, text } = await render();

    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(field<HTMLInputElement>('type-name').value).toBe('Certificado de membresía');
    expect(field<HTMLTextAreaElement>('text-introTemplate').value).toBe(
      'La {{denomination}} certifica que',
    );
    expect(repository.previewed[0].id).toBe(1);
    expect(text()).toContain('María Fernanda Pérez Gómez es miembro.');
    expect(text()).toContain('En blanco se imprime: «La Secretaría de {{sede}} hace constar».');
  });

  it('switches type and shows the texts and validity of the other one', async () => {
    const { host, field, fixture, repository } = await render();

    (host.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click();
    await settle(fixture);

    expect(field<HTMLInputElement>('type-name').value).toBe('Carta de traslado');
    expect(field<HTMLInputElement>('type-validity').value).toBe('90');
    expect(field<HTMLTextAreaElement>('text-introTemplate').value).toBe('');
    expect(repository.previewed.at(-1)?.id).toBe(2);
  });

  it('saves every field and confirms it', async () => {
    const { repository, type, submit, text } = await render();

    type('text-closingTemplate', 'Dado en {{city}}.');
    type('type-validity', '365');
    await submit();

    expect(repository.saved).toEqual([
      {
        id: 1,
        changes: {
          name: 'Certificado de membresía',
          validityDays: 365,
          template: '',
          introTemplate: 'La {{denomination}} certifica que',
          closingTemplate: 'Dado en {{city}}.',
          pastorTitleTemplate: '',
          secretaryTitleTemplate: '',
        },
      },
    ]);
    expect(text()).toContain('Cambios guardados');
  });

  it('sends null validity when the field is emptied', async () => {
    const { repository, type, submit } = await render();

    type('type-validity', '');
    await submit();

    expect(repository.saved[0].changes.validityDays).toBeNull();
  });

  it('inserts a placeholder at the end of the field that was selected', async () => {
    const { field, click, type, fixture } = await render();

    field<HTMLTextAreaElement>('text-closingTemplate').dispatchEvent(new Event('focus'));
    type('text-closingTemplate', 'Dado en ');
    click('{{city}}');
    fixture.detectChanges();

    expect(field<HTMLTextAreaElement>('text-closingTemplate').value).toBe('Dado en {{city}}');
  });

  it('does not save an invalid form', async () => {
    const { repository, type, submit } = await render();

    type('type-name', 'ab');
    await submit();

    expect(repository.saved).toEqual([]);
  });

  it('shows the message of the API when saving fails, and keeps the typed text', async () => {
    const repository = new FakeRepository();
    repository.saveResponse = throwError(
      () =>
        new DomainError(
          'CERTIFICATE_TEMPLATE_INVALID',
          'El encabezado usa marcadores que no existen: {{nope}}.',
          400,
        ),
    );
    const { type, submit, text, field } = await render(repository);

    type('text-introTemplate', 'Hola {{nope}}');
    await submit();

    expect(text()).toContain('marcadores que no existen: {{nope}}');
    expect(field<HTMLTextAreaElement>('text-introTemplate').value).toBe('Hola {{nope}}');
  });

  it('discards the unsaved changes', async () => {
    const { type, click, field, fixture } = await render();

    type('text-introTemplate', 'Otro texto');
    click('Descartar cambios');
    fixture.detectChanges();

    expect(field<HTMLTextAreaElement>('text-introTemplate').value).toBe(
      'La {{denomination}} certifica que',
    );
  });

  it('shows the error when the preview is rejected', async () => {
    const repository = new FakeRepository();
    repository.previewResponse = throwError(
      () =>
        new DomainError(
          'CERTIFICATE_TEMPLATE_INVALID',
          'El cierre usa marcadores que no existen.',
          400,
        ),
    );

    const { text } = await render(repository);

    expect(text()).toContain('El cierre usa marcadores que no existen.');
  });

  it('shows an error when the types cannot be loaded', async () => {
    const repository = new FakeRepository();
    repository.catalogResponse = throwError(
      () => new DomainError('FORBIDDEN', 'No tienes permiso para esta acción.', 403),
    );

    const { text, host } = await render(repository);

    expect(text()).toContain('No tienes permiso para esta acción.');
    expect(host.querySelector('form')).toBeNull();
  });
});
