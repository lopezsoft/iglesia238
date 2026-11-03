import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AccountingSetupPage } from './accounting-setup.page';
import {
  AccountRow,
  ContributionTypeRow,
  FundRow,
  PeriodRow,
  SetupOverview,
  TitheRuleRow,
} from './data/accounting-setup.models';
import { AccountingSetupRepository } from './data/accounting-setup.repository';

const OVERVIEW: SetupOverview = {
  today: '2026-11-02',
  year: 2026,
  activeFunds: 1,
  totalFunds: 1,
  openingTotal: 1_000_000,
  currentPeriod: null,
  congregationScoped: true,
  scopeLabel: 'Sede Central',
  periodsCount: 0,
  titheRule: null,
};

class FakeRepository extends AccountingSetupRepository {
  overview$: Observable<SetupOverview> = of(OVERVIEW);
  funds$: Observable<FundRow[]> | null = null;
  periods: PeriodRow[] = [];
  rules: TitheRuleRow[] = [];

  overview(): Observable<SetupOverview> {
    return this.overview$;
  }
  listFunds(): Observable<FundRow[]> {
    return this.funds$ ?? of([{ id: 1, denominationId: 1, name: 'Fondo Local', isActive: true, openingBalance: 1_000_000, openingLocked: false, inUse: false }]);
  }
  saveFund(): Observable<FundRow> {
    throw new Error('not used');
  }
  deleteFund(): Observable<void> {
    throw new Error('not used');
  }
  listAccounts(): Observable<AccountRow[]> {
    return of([]);
  }
  saveAccount(): Observable<AccountRow> {
    throw new Error('not used');
  }
  setAccountActive(): Observable<AccountRow> {
    throw new Error('not used');
  }
  deleteAccount(): Observable<void> {
    throw new Error('not used');
  }
  listContributionTypes(): Observable<ContributionTypeRow[]> {
    return of([]);
  }
  saveContributionType(): Observable<ContributionTypeRow> {
    throw new Error('not used');
  }
  setContributionTypeActive(): Observable<ContributionTypeRow> {
    throw new Error('not used');
  }
  listPeriods(): Observable<PeriodRow[]> {
    return of(this.periods);
  }
  openPeriod(): Observable<PeriodRow> {
    throw new Error('not used');
  }
  listTitheRules(): Observable<TitheRuleRow[]> {
    return of(this.rules);
  }
  saveTitheRule(): Observable<TitheRuleRow> {
    throw new Error('not used');
  }
  deleteTitheRule(): Observable<void> {
    throw new Error('not used');
  }
}

async function render(repository = new FakeRepository(), permissions: string[] = ['budgets.manage']) {
  const auth = {
    can: (permission: string) => permissions.includes(permission),
    tenant: signal({ denominationId: 1, congregationId: 10 }),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AccountingSetupRepository, useValue: repository }, { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(AccountingSetupPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function tabButton(element: HTMLElement, title: string): HTMLButtonElement {
  const found = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent?.includes(title));
  if (!found) {
    throw new Error(`No tab "${title}"`);
  }
  return found;
}

describe('AccountingSetupPage', () => {
  it('warns about what a new sede is missing: its period and the tithe percentages', async () => {
    const { element } = await render();

    const text = element.textContent ?? '';
    expect(text).toContain('no tiene abierto el periodo del mes en curso');
    expect(text).toContain('Falta definir los porcentajes de liquidación del diezmo');
    expect(text).toContain('Sin definir');
  });

  it('shows the percentages in force and no warning once everything is configured', async () => {
    const repository = new FakeRepository();
    repository.overview$ = of({
      ...OVERVIEW,
      currentPeriod: { year: 2026, month: 11, status: 'OPEN', label: 'Noviembre 2026' },
      periodsCount: 1,
      titheRule: {
        id: 1,
        denominationId: 1,
        effectiveFrom: '2026-01-01',
        nationalShareRate: 0.21,
        localFundRate: 0.03,
        inForce: true,
        inUse: false,
      },
    });

    const { element } = await render(repository);

    expect(element.textContent).toContain('21 % + 3 %');
    expect(element.textContent).not.toContain('Falta definir');
    expect(element.querySelector('.todos')).toBeNull();
  });

  it('offers the first period in the periods tab, and the percentages in the tithe tab', async () => {
    const { fixture, element } = await render();

    tabButton(element, 'Periodos').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Esta sede aún no tiene periodos contables');
    expect(element.textContent).toContain('Abrir el primer periodo');

    tabButton(element, 'Diezmo').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Aún no se han definido los porcentajes del diezmo');
    expect(element.textContent).toContain('Nuevo porcentaje');
  });

  it('hides the writing buttons from a role without budgets.manage', async () => {
    const { element } = await render(new FakeRepository(), []);

    expect(element.textContent).toContain('Solo lectura');
    expect(element.querySelector('app-page-header .btn--primary')).toBeNull();
  });

  it('draws the error banner, not a blank page, when the overview fails', async () => {
    const repository = new FakeRepository();
    repository.overview$ = throwError(() => new DomainError('SERVER_ERROR', 'El servidor no pudo completar la operación.', 500));

    const { element } = await render(repository);

    expect(element.querySelector('app-error-banner')).not.toBeNull();
    expect(element.textContent).toContain('No fue posible cargar el resumen de la configuración.');
    // The page header falls back to its generic text instead of throwing.
    expect(element.querySelector('h1')?.textContent).toContain('Configuración contable');
  });

  it('keeps the tabs on screen when one list fails to load', async () => {
    const repository = new FakeRepository();
    repository.funds$ = throwError(() => new DomainError('SERVER_ERROR', 'No pudimos leer los fondos.', 500));

    const { element } = await render(repository);

    expect(tabButton(element, 'Fondos')).toBeTruthy();
    expect(element.querySelector('app-error-banner')).not.toBeNull();
    // The other tabs keep working.
    expect(tabButton(element, 'Periodos')).toBeTruthy();
  });
});
