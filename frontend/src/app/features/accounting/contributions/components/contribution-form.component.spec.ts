import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../../core/errors/domain-error';
import { PersonOption } from '../../data/accounting.models';
import { ExportedFile } from '../../data/accounting-http';
import {
  ContributionDetail,
  ContributionFormOptions,
  ContributionListing,
  ContributionRow,
  RecordContributionCommand,
  VowPaymentTarget,
  VowPledgeOption,
} from '../data/contributions.models';
import { ContributionsRepository } from '../data/contributions.repository';
import { ContributionFormComponent } from './contribution-form.component';

const ANA: PersonOption = {
  id: 5,
  fullName: 'Ana Pérez',
  memberCode: 'SC-0130',
  congregationName: 'Sede Central',
  documentHint: 'CC ···1904',
};

const OPTIONS: ContributionFormOptions = {
  today: '2026-11-02',
  congregationScoped: true,
  scopeLabel: 'Sede Central',
  types: [
    { id: 1, name: 'Diezmo', category: 'TITHE' },
    { id: 2, name: 'Ofrenda', category: 'OFFERING' },
    { id: 3, name: 'Voto', category: 'VOW' },
  ],
  periods: [
    { year: 2026, month: 11, status: 'OPEN', label: 'Noviembre 2026' },
    { year: 2026, month: 10, status: 'CLOSED', label: 'Octubre 2026' },
  ],
  minDate: '2026-11-01',
  maxDate: '2026-11-02',
  settledTitheRanges: [{ from: '2026-11-01', to: '2026-11-01' }],
  nextReceiptNumber: 'REC-2026-00003',
};

const PLEDGE: VowPledgeOption = {
  id: 7,
  label: 'VOTO-2026-0007 · Templo · saldo $ 450.000',
  personId: 5,
  contributionTypeId: 3,
  balance: 450_000,
};

function saved(command: RecordContributionCommand): ContributionRow {
  return {
    id: 9,
    receiptNumber: 'REC-2026-00003',
    voucherId: 3,
    receivedOn: command.receivedOn,
    contributionTypeId: command.contributionTypeId,
    typeName: 'Diezmo',
    category: 'TITHE',
    personId: command.personId,
    contributorName: null,
    memberCode: null,
    vowPledgeId: command.vowPledgeId,
    vowPledgeCode: null,
    paymentMethod: command.paymentMethod,
    paymentReference: command.paymentReference,
    notes: command.notes,
    amount: command.amount,
    status: 'RECORDED',
    voidBlock: null,
    voidReason: null,
    congregationName: 'Sede Central',
  };
}

class FakeRepository extends ContributionsRepository {
  readonly commands: RecordContributionCommand[] = [];
  failWith: DomainError | null = null;

  override formOptions = (): Observable<ContributionFormOptions> => of(OPTIONS);
  override list = (): Observable<ContributionListing> => throwError(() => new Error('unused'));
  override detail = (): Observable<ContributionDetail> => throwError(() => new Error('unused'));
  override searchPersons = (query: string): Observable<PersonOption[]> => of(query.toLowerCase().startsWith('ana') ? [ANA] : []);
  override openPledges = (): Observable<VowPledgeOption[]> => of([PLEDGE]);
  override vowPaymentTarget = (): Observable<VowPaymentTarget> => of({ pledge: PLEDGE, person: ANA });
  override void = (): Observable<ContributionRow> => throwError(() => new Error('unused'));
  override exportCsv = (): Observable<ExportedFile> => throwError(() => new Error('unused'));
  override receiptPdf = (): Observable<Blob> => throwError(() => new Error('unused'));
  override record(command: RecordContributionCommand): Observable<ContributionRow> {
    this.commands.push(command);
    return this.failWith ? throwError(() => this.failWith) : of(saved(command));
  }
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

async function setup(preset: VowPaymentTarget | null = null) {
  const repository = new FakeRepository();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ContributionsRepository, useValue: repository }],
  });
  const fixture = TestBed.createComponent(ContributionFormComponent);
  fixture.componentRef.setInput('options', OPTIONS);
  fixture.componentRef.setInput('preset', preset);
  const recorded: ContributionRow[] = [];
  fixture.componentInstance.recorded.subscribe((row) => recorded.push(row));
  await settle(fixture);
  const element = fixture.nativeElement as HTMLElement;

  const type = (name: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('.type-group button')].find((b) => b.textContent?.trim() === name)!.click();
  const fill = (id: string, value: string) => {
    const input = element.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
  };
  // Options bound with [ngValue] have no readable value: pick them by position.
  const choose = (id: string, index: number) => {
    const select = element.querySelector<HTMLSelectElement>(`#${id}`)!;
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
  };
  const mode = (id: string) => element.querySelector<HTMLInputElement>(`#${id}`)!.click();
  const submit = async () => {
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(fixture);
  };
  return { fixture, repository, recorded, element, type, fill, choose, mode, submit };
}

describe('ContributionFormComponent', () => {
  it('starts on the allowed date with the first type selected', async () => {
    const { element } = await setup();

    expect(element.querySelector<HTMLInputElement>('#contribution-date')!.value).toBe('2026-11-02');
    expect(element.querySelector('.type-group button.btn--primary')?.textContent?.trim()).toBe('Diezmo');
  });

  it('records an anonymous offering without a person and without notes', async () => {
    const { fixture, repository, recorded, type, fill, mode, submit } = await setup();

    type('Ofrenda');
    mode('donor-anonymous');
    fill('contribution-amount', '50000');
    await settle(fixture);
    await submit();

    expect(repository.commands).toEqual([
      {
        contributionTypeId: 2,
        personId: null,
        receivedOn: '2026-11-02',
        amount: 50_000,
        paymentMethod: 'CASH',
        paymentReference: null,
        vowPledgeId: null,
        notes: null,
      },
    ]);
    expect(recorded).toHaveLength(1);
  });

  it('records a collection with its description, or a default one', async () => {
    const { fixture, repository, type, fill, mode, submit } = await setup();
    type('Ofrenda');
    mode('donor-collection');
    await settle(fixture);

    fill('contribution-amount', '120000');
    fill('collection-label', 'Culto dominical 10:00 a. m.');
    await submit();
    // The form goes back to a named contributor after saving: pick the collection again.
    mode('donor-collection');
    await settle(fixture);
    fill('contribution-amount', '80000');
    await submit();

    expect(repository.commands.map((c) => [c.personId, c.notes])).toEqual([
      [null, 'Culto dominical 10:00 a. m.'],
      [null, 'Colecta agregada'],
    ]);
  });

  it('records a named tithe after picking the person from the search', async () => {
    const { fixture, repository, element, fill, submit } = await setup();

    fill('contributor-search', 'Ana');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle(fixture);
    element.querySelector<HTMLButtonElement>('.results__item')!.click();
    await settle(fixture);
    fill('contribution-amount', '250000');
    await submit();

    expect(repository.commands[0]).toMatchObject({ contributionTypeId: 1, personId: 5, amount: 250_000, notes: null });
    expect(element.textContent).not.toContain('Selecciona la persona que aporta');
  });

  it('explains what is missing and does not call the API', async () => {
    const { repository, element, submit } = await setup();

    await submit();

    expect(repository.commands).toHaveLength(0);
    expect(element.textContent).toContain('Selecciona la persona que aporta.');
    expect(element.textContent).toContain('Escribe un valor mayor que cero.');
  });

  it('requires the reference for bank methods', async () => {
    const { fixture, repository, element, type, fill, choose, mode, submit } = await setup();
    type('Ofrenda');
    mode('donor-anonymous');
    fill('contribution-amount', '10000');
    choose('payment-method', 1);
    await settle(fixture);

    await submit();
    expect(repository.commands).toHaveLength(0);
    expect(element.textContent).toContain('La referencia es obligatoria para este medio de pago.');

    fill('payment-reference', 'TRX 884120');
    await submit();
    expect(repository.commands[0]).toMatchObject({ paymentMethod: 'BANK_TRANSFER', paymentReference: 'TRX 884120' });
  });

  it('rejects a tithe dated inside a settled range before calling the API', async () => {
    const { fixture, repository, element, type, fill, mode, submit } = await setup();
    mode('donor-anonymous');
    fill('contribution-amount', '10000');
    fill('contribution-date', '2026-11-01');
    await settle(fixture);
    await submit();

    expect(repository.commands).toHaveLength(0);
    expect(element.textContent).toContain('ya fueron liquidados');
    type('Ofrenda');
    await settle(fixture);
    await submit();
    expect(repository.commands).toHaveLength(1);
  });

  it('rejects a date in a closed period', async () => {
    const { fixture, repository, element, type, fill, mode, submit } = await setup();
    type('Ofrenda');
    mode('donor-anonymous');
    fill('contribution-amount', '10000');
    fill('contribution-date', '2026-10-25');
    await settle(fixture);
    await submit();

    expect(repository.commands).toHaveLength(0);
    expect(element.textContent).toContain('periodo contable abierto');
  });

  it('pays a pledge preselected from Votos', async () => {
    const { repository, recorded, element, fill, submit, fixture } = await setup({ pledge: PLEDGE, person: ANA });

    expect(element.querySelector('.selected__name')?.textContent).toContain('Ana Pérez');
    expect(element.querySelector('.type-group button.btn--primary')?.textContent?.trim()).toBe('Voto');
    fill('contribution-amount', '100000');
    await settle(fixture);
    await submit();

    expect(repository.commands[0]).toMatchObject({ contributionTypeId: 3, personId: 5, vowPledgeId: 7, amount: 100_000 });
    expect(recorded).toHaveLength(1);
  });

  it('shows the message of the API when recording fails and keeps what was typed', async () => {
    const { fixture, repository, element, type, fill, mode, submit } = await setup();
    repository.failWith = new DomainError('PERIOD_CLOSED', 'El periodo contable de esa fecha está cerrado.', 409);
    type('Ofrenda');
    mode('donor-anonymous');
    fill('contribution-amount', '10000');
    await settle(fixture);

    await submit();

    expect(element.querySelector('.alert--danger')?.textContent).toContain('El periodo contable de esa fecha está cerrado.');
    expect(element.querySelector<HTMLInputElement>('#contribution-amount')!.value).toBe('10000');
  });
});
