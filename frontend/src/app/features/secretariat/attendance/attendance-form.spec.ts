import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';
import {
  buildAttendanceForm,
  configureAttendanceForm,
  formCounts,
  formTotal,
} from './attendance-form';
import { AttendanceOptions } from './data/attendance.models';

const options: AttendanceOptions = {
  congregations: [{ id: 10, name: 'Sede Central' }],
  meetingTypes: [
    { code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' },
    { code: 'PRAYER_MEETING', name: 'Reunión de oración' },
  ],
  categories: [
    { code: 'CHILDREN', name: 'Niños' },
    { code: 'MEN', name: 'Hermanos' },
  ],
  today: '2026-11-02',
  maxHeadcount: 2000,
};

function form() {
  const built = buildAttendanceForm(TestBed.inject(NonNullableFormBuilder));
  configureAttendanceForm(built, options);
  return built;
}

describe('attendance form', () => {
  it('adapts to the options: one control per category, the server date and the first meeting type', () => {
    const built = form();

    expect(Object.keys(built.controls.counts.controls)).toEqual(['CHILDREN', 'MEN']);
    expect(built.controls.sessionDate.value).toBe('2026-11-02');
    expect(built.controls.meetingTypeCode.value).toBe('SUNDAY_SCHOOL');
  });

  it('does not touch what the person already chose when the options load again', () => {
    const built = form();
    built.controls.meetingTypeCode.setValue('PRAYER_MEETING');
    built.controls.sessionDate.setValue('2026-10-25');
    built.controls.counts.controls['MEN'].setValue(9);

    configureAttendanceForm(built, options);

    expect(built.controls.meetingTypeCode.value).toBe('PRAYER_MEETING');
    expect(built.controls.sessionDate.value).toBe('2026-10-25');
    expect(built.controls.counts.controls['MEN'].value).toBe(9);
  });

  it('rejects a date after the server date', () => {
    const built = form();

    built.controls.sessionDate.setValue('2026-11-03');
    expect(built.controls.sessionDate.hasError('futureDate')).toBe(true);

    built.controls.sessionDate.setValue('2026-11-02');
    expect(built.controls.sessionDate.valid).toBe(true);
  });

  it('validates headcounts as integers between 0 and the limit', () => {
    const built = form();
    const children = built.controls.counts.controls['CHILDREN'];

    children.setValue(-1);
    expect(children.hasError('min')).toBe(true);
    children.setValue(2001);
    expect(children.hasError('max')).toBe(true);
    children.setValue(2.5);
    expect(children.hasError('integer')).toBe(true);
    children.setValue(40);
    expect(children.valid).toBe(true);
  });

  it('counts empty or invalid inputs as 0 and totals the rest', () => {
    const built = form();
    built.controls.counts.controls['CHILDREN'].setValue(40);
    built.controls.counts.controls['MEN'].setValue(null);

    const value = built.getRawValue();

    expect(formCounts(value, options.categories, options.maxHeadcount)).toEqual([
      { categoryCode: 'CHILDREN', headcount: 40 },
      { categoryCode: 'MEN', headcount: 0 },
    ]);
    expect(formTotal(value, options.categories, options.maxHeadcount)).toBe(40);
  });
});
