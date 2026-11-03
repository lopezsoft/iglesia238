import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../../core/errors/domain-error';
import { CopyBudgetCommand, CopyBudgetResult } from '../data/budget.models';
import { BudgetRepository } from '../data/budget.repository';
import { BudgetCopyDialogComponent } from './budget-copy-dialog.component';

class FakeRepository extends BudgetRepository {
  readonly commands: CopyBudgetCommand[] = [];
  failWith: DomainError | null = null;

  override copy(command: CopyBudgetCommand): Observable<CopyBudgetResult> {
    this.commands.push(command);
    return this.failWith ? throwError(() => this.failWith) : of({ budgetId: 1, copied: 3, skipped: 0 });
  }
  override overview(): never {
    throw new Error('not used');
  }
  override saveLine(): never {
    throw new Error('not used');
  }
  override deleteLine(): never {
    throw new Error('not used');
  }
  override lineDetail(): never {
    throw new Error('not used');
  }
  override changeStatus(): never {
    throw new Error('not used');
  }
  override setIncomeIncreaseRate(): never {
    throw new Error('not used');
  }
}

async function render() {
  const repository = new FakeRepository();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetRepository, useValue: repository }] });
  const fixture = TestBed.createComponent(BudgetCopyDialogComponent);
  fixture.componentRef.setInput('type', 'FIXED');
  fixture.componentRef.setInput('targetYear', 2026);
  fixture.componentRef.setInput('years', [2027, 2026, 2025]);
  fixture.componentInstance.open.set(true);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, repository, component: fixture.componentInstance as unknown as { submit(): Promise<void>; form: { controls: { adjustment: { setValue(value: number | null): void } } }; error(): string | null } };
}

describe('BudgetCopyDialogComponent', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('copies from the most recent other year and turns the percentage into a fraction', async () => {
    const { fixture, repository, component } = await render();
    const copied = vi.fn();
    fixture.componentInstance.copied.subscribe(copied);
    component.form.controls.adjustment.setValue(5);

    await component.submit();

    expect(repository.commands).toEqual([{ type: 'FIXED', sourceYear: 2027, targetYear: 2026, adjustmentRate: 0.05 }]);
    expect(copied).toHaveBeenCalledWith({ budgetId: 1, copied: 3, skipped: 0 });
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('copies as they are when no adjustment is typed and supports a reduction', async () => {
    const { repository, component } = await render();

    await component.submit();
    component.form.controls.adjustment.setValue(-3);
    await component.submit();

    expect(repository.commands.map((command) => command.adjustmentRate)).toEqual([null, -0.03]);
  });

  it('shows the message of the API and stays open when the copy fails', async () => {
    const { fixture, repository, component } = await render();
    repository.failWith = new DomainError('BUDGET_CLOSED', 'El presupuesto 2026 está cerrado: solo lectura.', 409);

    await component.submit();

    expect(component.error()).toBe('El presupuesto 2026 está cerrado: solo lectura.');
    expect(fixture.componentInstance.open()).toBe(true);
  });
});
