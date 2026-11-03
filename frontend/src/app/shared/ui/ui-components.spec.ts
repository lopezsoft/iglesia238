import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { DropdownComponent } from './dropdown.component';
import { ReadOnlyNoticeComponent } from './feedback.components';
import { HeroCardComponent } from './hero-card.component';
import { SegmentedControlComponent } from './segmented-control.component';
import { SparklineComponent } from './sparkline.component';
import { StatCardComponent } from './stat-card.component';
import { TabCardsComponent } from './tab-cards.component';
import { TextFieldComponent } from './text-field.component';

function keydown(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('SparklineComponent', () => {
  it('draws a line and an area for a series and nothing for fewer than two points', async () => {
    const fixture = TestBed.createComponent(SparklineComponent);
    fixture.componentRef.setInput('series', [1, 4, 2, 6]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('path')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('svg').getAttribute('aria-hidden')).toBe('true');

    fixture.componentRef.setInput('series', [3]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();
  });
});

describe('HeroCardComponent', () => {
  it('shows the comparison chip and hides the chart when there is no history', async () => {
    const fixture = TestBed.createComponent(HeroCardComponent);
    fixture.componentRef.setInput('title', '¿Cómo va la iglesia hoy?');
    fixture.componentRef.setInput('eyebrow', 'Recaudo de la iglesia');
    fixture.componentRef.setInput('label', 'Aportes netos · Hoy');
    fixture.componentRef.setInput('value', '$ 0');
    fixture.componentRef.setInput('comparison', { text: 'Sin comparativo', tone: 'neutral' });
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Sin comparativo');
    expect(element.querySelector('app-sparkline')).toBeNull();

    fixture.componentRef.setInput('series', [1, 2, 3]);
    await fixture.whenStable();
    expect(element.querySelector('app-sparkline')).not.toBeNull();
  });
});

describe('StatCardComponent', () => {
  it('keeps working with the original inputs (label, value, hint)', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(StatCardComponent);
    fixture.componentRef.setInput('label', 'Miembros activos');
    fixture.componentRef.setInput('value', 148);
    fixture.componentRef.setInput('hint', 'Al día de hoy');
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Miembros activos');
    expect(text).toContain('148');
    expect(text).toContain('Al día de hoy');
    expect(fixture.nativeElement.querySelector('.stat__footer')).toBeNull();
  });

  it('shows the comparison pill and the footer when given', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(StatCardComponent);
    fixture.componentRef.setInput('label', 'Aportes');
    fixture.componentRef.setInput('value', '$ 1.200.000');
    fixture.componentRef.setInput('icon', 'coins');
    fixture.componentRef.setInput('tone', 'green');
    fixture.componentRef.setInput('comparison', '+12 %');
    fixture.componentRef.setInput('compareLabel', 'vs. ayer');
    fixture.componentRef.setInput('compareValue', '$ 1.070.000');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.stat__comparison')?.textContent).toContain('+12 %');
    expect(element.querySelector('.stat__footer')?.textContent).toContain('vs. ayer');
    expect(element.querySelector('.stat')?.classList.contains('tone-green')).toBe(true);
  });
});

describe('SegmentedControlComponent', () => {
  it('selects with a click and moves with the arrow keys', async () => {
    const fixture = TestBed.createComponent(SegmentedControlComponent);
    fixture.componentRef.setInput('options', [
      { value: 'today', label: 'Hoy' },
      { value: 'week', label: '7 días' },
      { value: 'month', label: 'Mes' },
    ]);
    fixture.componentRef.setInput('value', 'today');
    fixture.componentRef.setInput('ariaLabel', 'Periodo');
    await fixture.whenStable();

    const radios = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(radios().map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);

    radios()[2].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('month');

    keydown(radios()[2], 'ArrowRight');
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('today');
  });
});

describe('TabCardsComponent', () => {
  it('exposes tab semantics and moves between tabs with the arrow keys', async () => {
    const fixture = TestBed.createComponent(TabCardsComponent);
    fixture.componentRef.setInput('items', [
      { id: 'general', title: 'General', subtitle: '¿Cómo va el día?', icon: 'layout-grid' },
      { id: 'indicators', title: 'Indicadores', subtitle: '¿Cómo va la iglesia?', icon: 'activity' },
    ]);
    fixture.componentRef.setInput('selected', 'general');
    fixture.componentRef.setInput('ariaLabel', 'Secciones');
    await fixture.whenStable();

    const tabs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(tabs[0].getAttribute('aria-controls')).toBe('tabcard-panel-general');
    // Pages render only the selected panel: an inactive tab must not point to an id that is not in the DOM.
    expect(tabs[1].hasAttribute('aria-controls')).toBe(false);
    expect(tabs[1].tabIndex).toBe(-1);

    keydown(tabs[0], 'ArrowRight');
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('indicators');
    expect(tabs[0].hasAttribute('aria-controls')).toBe(false);
    expect(tabs[1].getAttribute('aria-controls')).toBe('tabcard-panel-indicators');
  });
});

describe('ReadOnlyNoticeComponent', () => {
  it('says what the role cannot do in words and never shows the permission code', async () => {
    const fixture = TestBed.createComponent(ReadOnlyNoticeComponent);
    fixture.componentRef.setInput('permission', 'socioeconomic-profiles.write');
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Solo lectura');
    expect(text).toContain('Editar la ficha socioeconómica');
    expect(text).toContain('pídelo a tu administrador');
    expect(text).not.toContain('socioeconomic-profiles');
    expect((fixture.nativeElement as HTMLElement).querySelector('code')).toBeNull();
  });
});

@Component({
  imports: [DropdownComponent],
  template: `
    <app-dropdown label="Acciones">
      <span dropdown-trigger>Abrir</span>
      <a role="menuitem" href="#uno" (click)="$event.preventDefault(); picked.set('uno')">Uno</a>
      <a role="menuitem" href="#dos" (click)="$event.preventDefault(); picked.set('dos')">Dos</a>
    </app-dropdown>
  `,
})
class DropdownHost {
  readonly picked = signal('');
}

describe('DropdownComponent', () => {
  it('opens on click, closes on Escape and after choosing an entry', async () => {
    const fixture = TestBed.createComponent(DropdownHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('[role="menu"]')).toBeNull();

    trigger.click();
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelectorAll('[role="menuitem"]')).toHaveLength(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(element.querySelector('[role="menu"]')).toBeNull();

    trigger.click();
    await fixture.whenStable();
    element.querySelectorAll<HTMLElement>('[role="menuitem"]')[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.picked()).toBe('dos');
    expect(element.querySelector('[role="menu"]')).toBeNull();
  });

  it('closes when the user presses outside of it', async () => {
    const fixture = TestBed.createComponent(DropdownHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    await fixture.whenStable();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();

    expect(element.querySelector('[role="menu"]')).toBeNull();
  });
});

@Component({
  imports: [ReactiveFormsModule, TextFieldComponent],
  template: `
    <app-text-field label="Contraseña" type="password" icon="lock" [formControl]="control" [error]="error()" />
  `,
})
class TextFieldHost {
  readonly control = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly error = signal<string | null>(null);
}

describe('TextFieldComponent', () => {
  it('writes what the user types to the form control and toggles the password visibility', async () => {
    const fixture = TestBed.createComponent(TextFieldHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input')!;

    expect(element.querySelector('label')?.textContent).toContain('Contraseña');
    expect(input.type).toBe('password');

    input.value = 'una-clave';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.control.value).toBe('una-clave');

    element.querySelector<HTMLButtonElement>('.input-group__action')!.click();
    await fixture.whenStable();
    expect(input.type).toBe('text');
  });

  it('marks the input invalid and describes it with the error message', async () => {
    const fixture = TestBed.createComponent(TextFieldHost);
    fixture.componentInstance.error.set('Escribe tu contraseña.');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input')!;
    const message = element.querySelector('.field__error')!;

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(message.id);
    expect(message.textContent).toContain('Escribe tu contraseña.');
  });

  it('keeps the form control in sync when the form writes a value', async () => {
    const fixture = TestBed.createComponent(TextFieldHost);
    await fixture.whenStable();
    fixture.componentInstance.control.setValue('desde-el-formulario');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('input').value).toBe('desde-el-formulario');
  });
});
