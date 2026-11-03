import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';
import { buildPersonForm } from './person-form';

function documentControl() {
  const form = buildPersonForm(TestBed.inject(NonNullableFormBuilder));
  return form.controls.documentNumber;
}

describe('buildPersonForm: document number', () => {
  it('accepts up to 30 characters, the limit of the API', () => {
    const control = documentControl();

    control.setValue('1'.repeat(30));
    expect(control.valid).toBe(true);
    control.setValue('1.234.567-8 A');
    expect(control.valid).toBe(true);
  });

  it('refuses more than 30 characters here instead of letting the API answer 400', () => {
    const control = documentControl();

    control.setValue('1'.repeat(31));

    expect(control.hasError('pattern')).toBe(true);
  });

  it('refuses fewer than 3 characters or symbols the API does not accept', () => {
    const control = documentControl();

    control.setValue('12');
    expect(control.hasError('pattern')).toBe(true);
    control.setValue('12345;');
    expect(control.hasError('pattern')).toBe(true);
  });
});
