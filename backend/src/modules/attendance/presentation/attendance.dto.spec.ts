import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AttendanceFilterQueryDto,
  ListAttendanceQueryDto,
} from './attendance.dto.js';

const errorsOf = (dto: object) => validateSync(dto).map((e) => e.property);

describe.each([
  ['AttendanceFilterQueryDto', AttendanceFilterQueryDto],
  ['ListAttendanceQueryDto', ListAttendanceQueryDto],
] as const)('%s: meetingTypeCode', (_name, type) => {
  it.each(['SUNDAY_SCHOOL', 'CELL_2', undefined])('accepts %s', (code) => {
    expect(errorsOf(plainToInstance(type, { meetingTypeCode: code }))).toEqual(
      [],
    );
  });

  it.each([
    "x\";\r\nfilename*=UTF-8''a.exe",
    'sunday school',
    'sunday_school',
    '1ABC',
    'A'.repeat(31),
    '../etc',
  ])('rejects %j', (code) => {
    expect(
      errorsOf(plainToInstance(type, { meetingTypeCode: code })),
    ).toContain('meetingTypeCode');
  });
});
