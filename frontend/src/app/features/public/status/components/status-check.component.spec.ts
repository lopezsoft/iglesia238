import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../../core/errors/domain-error';
import {
  ApplicationStatusCheck,
  ApplicationSubmission,
  CurrentPrivacyPolicy,
  MunicipalityOption,
  OpenCongregation,
  PublicCatalogs,
  SubmissionReceipt,
} from '../../application/data/public-application.models';
import { PublicApplicationRepository } from '../../application/data/public-application.repository';
import { StatusCheckComponent } from './status-check.component';

class FakeRepository extends PublicApplicationRepository {
  readonly requested: string[] = [];
  response: Observable<ApplicationStatusCheck> = of({
    status: 'PENDING',
    statusLabel: 'Pendiente',
    submittedOn: '2026-11-01T10:00:00.000Z',
    reviewedOn: null,
    notice: null,
  });

  checkStatus(code: string): Observable<ApplicationStatusCheck> {
    this.requested.push(code);
    return this.response;
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
  searchMunicipalities(): Observable<MunicipalityOption[]> {
    return of([]);
  }
  submit(_input: ApplicationSubmission): Observable<SubmissionReceipt> {
    throw new Error('not used');
  }
}

async function render() {
  TestBed.configureTestingModule({
    providers: [{ provide: PublicApplicationRepository, useClass: FakeRepository }],
  });
  const fixture = TestBed.createComponent(StatusCheckComponent);
  await fixture.whenStable();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    repository: TestBed.inject(PublicApplicationRepository) as FakeRepository,
  };
}

async function search(fixture: Awaited<ReturnType<typeof render>>['fixture'], code: string) {
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector<HTMLInputElement>('input')!;
  input.value = code;
  input.dispatchEvent(new Event('input'));
  element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
}

describe('StatusCheckComponent', () => {
  it('asks for the code instead of calling the API when it is empty', async () => {
    const { fixture, element, repository } = await render();

    await search(fixture, '');

    expect(repository.requested).toEqual([]);
    expect(element.textContent).toContain('Escribe el código que recibiste');
  });

  it('looks the code up normalized and shows the status and dates only', async () => {
    const { fixture, element, repository } = await render();

    await search(fixture, ' ig-7f3k-92qd ');

    expect(repository.requested).toEqual(['IG-7F3K-92QD']);
    expect(element.textContent).toContain('Pendiente');
    expect(element.textContent).toContain('Aún sin decidir');
    expect(element.querySelector('.status-card__notice')).toBeNull();
  });

  it('shows the generic notice of a rejection and nothing else about it', async () => {
    const { fixture, element, repository } = await render();
    repository.response = of({
      status: 'REJECTED',
      statusLabel: 'Rechazada',
      submittedOn: '2026-11-01T10:00:00.000Z',
      reviewedOn: '2026-11-02T10:00:00.000Z',
      notice: 'Tu solicitud no fue aprobada. Comunícate con la secretaría de la sede.',
    });

    await search(fixture, 'IG-7F3K-92QD');

    expect(element.textContent).toContain('Rechazada');
    expect(element.querySelector('.status-card__notice')?.textContent).toContain('no fue aprobada');
    expect(element.textContent).not.toContain('Motivo');
  });

  it('shows the message of an unknown code', async () => {
    const { fixture, element, repository } = await render();
    repository.response = throwError(
      () => new DomainError('NOT_FOUND', 'No encontramos una solicitud con ese código.', 404),
    );

    await search(fixture, 'IG-AAAA-BBBB');

    expect(element.querySelector('[class*="alert"]')?.textContent).toContain('No encontramos una solicitud');
  });
});
