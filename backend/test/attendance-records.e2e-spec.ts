import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AUDIT_RECORDER } from '../src/common/audit/audit-recorder.port.js';
import { TRANSACTION_RUNNER } from '../src/common/persistence/transaction.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import {
  ASSIGNMENTS_READER,
  type AssignmentsReader,
  type UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { Clock } from '../src/common/time/bogota-time.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { ATTENDANCE_REPOSITORY } from '../src/modules/attendance/application/attendance.repository.js';
import { InMemoryAttendanceRepository } from '../src/modules/attendance/testing/in-memory-attendance.repository.js';
import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
} from '../src/modules/attendance/testing/test-doubles.js';
import {
  CHILD_DEDICATION_REPOSITORY,
  CONGREGATION_DIRECTORY,
  MARRIAGE_REPOSITORY,
  PASTORAL_TERM_REPOSITORY,
  PEOPLE_DIRECTORY,
  PEOPLE_SEARCH,
} from '../src/modules/secretariat-records/application/ports/records.ports.js';
import {
  FakeCongregationDirectory,
  FakePeopleDirectory,
  FakePeopleSearch,
  FakeRecordsWorld,
  InMemoryChildDedicationRepository,
  InMemoryMarriageRepository,
  InMemoryPastoralTermRepository,
  TODAY,
} from '../src/modules/secretariat-records/testing/in-memory-records.js';

function secretary(
  userId: number,
  congregationId: number,
  denominationId: number,
): UserAccess {
  return {
    userId,
    isActive: true,
    assignments: [
      {
        roleCode: 'SECRETARY',
        kind: 'CONGREGATION',
        scopeKey: `C:${congregationId}`,
        denominationId,
        congregationId,
        permissions: ['attendance.write', 'members.write', 'members.read'],
      },
    ],
  };
}

const accessByUser = new Map<number, UserAccess>([
  [1, secretary(1, 10, 1)],
  [2, secretary(2, 20, 2)],
  [
    3,
    {
      userId: 3,
      isActive: true,
      assignments: [
        {
          roleCode: 'TREASURER',
          kind: 'CONGREGATION',
          scopeKey: 'C:10',
          denominationId: 1,
          congregationId: 10,
          permissions: ['contributions.read'],
        },
      ],
    },
  ],
]);

const reader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(accessByUser.get(userId) ?? null),
  findCongregationDenominationId: (id) =>
    Promise.resolve(id === 10 || id === 11 ? 1 : id === 20 ? 2 : null),
};

describe('Attendance and secretariat records over HTTP', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;
  const world = new FakeRecordsWorld();
  const audit = new FakeAuditRecorder();
  let pastorId: number;

  const call = async (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    options: { user?: number; scope?: string; body?: unknown } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(options.user === undefined
          ? {}
          : {
              authorization: `Bearer ${(await tokens.sign({ userId: options.user, sessionId: 'sid' })).token}`,
            }),
        ...(options.scope === undefined ? {} : { 'x-scope': options.scope }),
      },
      ...(options.body === undefined
        ? {}
        : { payload: options.body as object }),
    });

  beforeAll(async () => {
    pastorId = world.person(1, 'Daniel Herrera', { congregationId: 10 }).id;
    world.person(2, 'Daniel Ajeno', { congregationId: 20 });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({
        isActive: () => Promise.resolve(true),
        isEmailVerified: () => Promise.resolve(true),
      })
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(reader)
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(new FakeTransactionRunner())
      .overrideProvider(AUDIT_RECORDER)
      .useValue(audit)
      .overrideProvider(Clock)
      .useValue(FixedClock.at(TODAY))
      .overrideProvider(ATTENDANCE_REPOSITORY)
      .useValue(new InMemoryAttendanceRepository())
      .overrideProvider(CONGREGATION_DIRECTORY)
      .useValue(new FakeCongregationDirectory())
      .overrideProvider(PEOPLE_DIRECTORY)
      .useValue(new FakePeopleDirectory(world))
      .overrideProvider(PEOPLE_SEARCH)
      .useValue(new FakePeopleSearch(world))
      .overrideProvider(CHILD_DEDICATION_REPOSITORY)
      .useValue(new InMemoryChildDedicationRepository(world))
      .overrideProvider(MARRIAGE_REPOSITORY)
      .useValue(new InMemoryMarriageRepository(world))
      .overrideProvider(PASTORAL_TERM_REPOSITORY)
      .useValue(new InMemoryPastoralTermRepository(world))
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    tokens = app.get(AccessTokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('attendance', () => {
    const session = {
      congregationId: 10,
      meetingTypeCode: 'SUNDAY_SCHOOL',
      sessionDate: '2026-11-01',
      attendanceCounts: [
        { categoryCode: 'CHILDREN', headcount: 40 },
        { categoryCode: 'MEN', headcount: 12 },
      ],
    };

    it('needs a session, the X-Scope header and the attendance.write permission', async () => {
      expect((await call('GET', '/api/attendance-sessions')).statusCode).toBe(
        401,
      );
      expect(
        (await call('GET', '/api/attendance-sessions', { user: 1 })).json(),
      ).toMatchObject({
        code: 'SCOPE_REQUIRED',
      });
      expect(
        (
          await call('GET', '/api/attendance-sessions', {
            user: 3,
            scope: 'C:10',
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await call('GET', '/api/attendance-sessions', {
            user: 1,
            scope: 'C:20',
          })
        ).json(),
      ).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
    });

    it('records a session, rejects a duplicate with its code and lists it', async () => {
      const created = await call('POST', '/api/attendance-sessions', {
        user: 1,
        scope: 'C:10',
        body: session,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        total: 52,
        congregationName: 'Sede Central',
      });

      const duplicate = await call('POST', '/api/attendance-sessions', {
        user: 1,
        scope: 'C:10',
        body: session,
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ code: 'DUPLICATE_SESSION' });

      const list = await call('GET', '/api/attendance-sessions?pageSize=10', {
        user: 1,
        scope: 'C:10',
      });
      expect(list.json()).toMatchObject({ total: 1, page: 1, pageSize: 10 });

      const lookup = await call(
        'GET',
        '/api/attendance-sessions/lookup?congregationId=10&meetingTypeCode=SUNDAY_SCHOOL&sessionDate=2026-11-01',
        { user: 1, scope: 'C:10' },
      );
      expect(lookup.json()).toMatchObject({ total: 52 });
      const missing = await call(
        'GET',
        '/api/attendance-sessions/lookup?congregationId=10&meetingTypeCode=SUNDAY_SCHOOL&sessionDate=2026-10-25',
        { user: 1, scope: 'C:10' },
      );
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });

    it('answers 400 with a Spanish message for malformed input and extra fields', async () => {
      const badDate = await call('POST', '/api/attendance-sessions', {
        user: 1,
        scope: 'C:10',
        body: { ...session, sessionDate: '01/11/2026' },
      });
      expect(badDate.statusCode).toBe(400);
      expect(JSON.stringify(badDate.json())).toContain(
        'Indica una fecha válida',
      );

      const extra = await call('POST', '/api/attendance-sessions', {
        user: 1,
        scope: 'C:10',
        body: { ...session, isAdmin: true },
      });
      expect(extra.statusCode).toBe(400);

      const empty = await call('POST', '/api/attendance-sessions', {
        user: 1,
        scope: 'C:10',
        body: { ...session, sessionDate: '2026-10-25', attendanceCounts: [] },
      });
      expect(empty.json()).toMatchObject({
        code: 'EMPTY_SESSION',
        statusCode: 422,
      });
    });

    it('does not show or touch the sessions of another denomination', async () => {
      const other = await call('GET', '/api/attendance-sessions', {
        user: 2,
        scope: 'C:20',
      });
      expect(other.json()).toMatchObject({ total: 0 });

      const stealing = await call('PUT', '/api/attendance-sessions/1', {
        user: 2,
        scope: 'C:20',
        body: { attendanceCounts: [{ categoryCode: 'MEN', headcount: 1 }] },
      });
      expect(stealing.statusCode).toBe(404);
      const crossSede = await call('POST', '/api/attendance-sessions', {
        user: 2,
        scope: 'C:20',
        body: { ...session, sessionDate: '2026-10-25' },
      });
      expect(crossSede.statusCode).toBe(404);
    });

    it('exports a CSV, corrects and deletes a session', async () => {
      const csv = await call('GET', '/api/attendance-sessions/export', {
        user: 1,
        scope: 'C:10',
      });
      expect(csv.statusCode).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain(
        'asistencia-todas.csv',
      );
      expect(csv.body.startsWith('﻿')).toBe(true);
      expect(csv.body).toContain(
        '2026-11-01;Sede Central;Escuela Dominical;40;0;0;12;0;52',
      );

      const updated = await call('PUT', '/api/attendance-sessions/1', {
        user: 1,
        scope: 'C:10',
        body: { attendanceCounts: [{ categoryCode: 'MEN', headcount: 7 }] },
      });
      expect(updated.json()).toMatchObject({ total: 7 });

      const stats = await call(
        'GET',
        '/api/attendance-sessions/stats?groupBy=month',
        { user: 1, scope: 'C:10' },
      );
      expect(stats.json()).toMatchObject({ groupBy: 'month', sessionCount: 1 });

      expect(
        (
          await call('DELETE', '/api/attendance-sessions/1', {
            user: 1,
            scope: 'C:10',
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (
          await call('GET', '/api/attendance-sessions/1', {
            user: 1,
            scope: 'C:10',
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await call('GET', '/api/attendance-sessions/abc', {
            user: 1,
            scope: 'C:10',
          })
        ).statusCode,
      ).toBe(404);
    });
  });

  describe('secretariat records', () => {
    it('is restricted to members.write', async () => {
      for (const url of [
        '/api/marriages',
        '/api/child-dedications',
        '/api/pastoral-terms',
        '/api/secretariat/records/summary',
      ]) {
        expect(
          (await call('GET', url, { user: 3, scope: 'C:10' })).statusCode,
        ).toBe(403);
        expect((await call('GET', url)).statusCode).toBe(401);
      }
    });

    it('registers pastoral terms and answers 409 OVERLAPPING_TERM', async () => {
      const body = { congregationId: 10, pastorId, startedOn: '2021-02-01' };
      const created = await call('POST', '/api/pastoral-terms', {
        user: 1,
        scope: 'C:10',
        body,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        endedOn: null,
        congregationName: 'Sede Central',
      });

      const overlap = await call('POST', '/api/pastoral-terms', {
        user: 1,
        scope: 'C:10',
        body,
      });
      expect(overlap.statusCode).toBe(409);
      expect(overlap.json()).toMatchObject({ code: 'OVERLAPPING_TERM' });

      const replaced = await call('POST', '/api/pastoral-terms', {
        user: 1,
        scope: 'C:10',
        body: { ...body, startedOn: '2026-11-01', closeCurrent: true },
      });
      expect(replaced.statusCode).toBe(201);
      const terms = await call('GET', '/api/pastoral-terms?current=true', {
        user: 1,
        scope: 'C:10',
      });
      expect(terms.json()).toHaveLength(1);

      const summary = await call('GET', '/api/secretariat/records/summary', {
        user: 1,
        scope: 'C:10',
      });
      expect(summary.json()).toMatchObject({
        termsTotal: 2,
        currentPastor: { fullName: 'Daniel Herrera' },
      });
    });

    it('registers a marriage and a dedication, masking documents and keeping minors restricted', async () => {
      const groom = world.person(1, 'Andrés Mora', { congregationId: 10 }).id;
      const bride = world.person(1, 'Lucía Peña', { congregationId: 10 }).id;
      const kid = world.person(1, 'Sofía Mora', { birthDate: '2024-03-14' }).id;

      const marriage = await call('POST', '/api/marriages', {
        user: 1,
        scope: 'C:10',
        body: {
          spouse1Id: groom,
          spouse2Id: bride,
          marriedOn: '2026-07-18',
          place: 'Templo',
          registeredWith: 'CHURCH',
        },
      });
      expect(marriage.statusCode).toBe(201);
      expect(JSON.stringify(marriage.json())).not.toContain('tribunal');

      const again = await call('POST', '/api/marriages', {
        user: 1,
        scope: 'C:10',
        body: {
          spouse1Id: groom,
          spouse2Id: bride,
          marriedOn: '2026-07-18',
          place: 'Templo',
          registeredWith: 'CHURCH',
        },
      });
      expect(again.json()).toMatchObject({ code: 'ACTIVE_MARRIAGE_EXISTS' });

      const dedication = await call('POST', '/api/child-dedications', {
        user: 1,
        scope: 'C:10',
        body: {
          congregationId: 10,
          childId: kid,
          dedicatedOn: '2026-10-25',
          father: { personId: groom },
          mother: { name: 'Gloria Muñoz' },
        },
      });
      expect(dedication.statusCode).toBe(201);
      expect(
        dedication.json<{ child: { maskedDocument: string } }>().child
          .maskedDocument,
      ).toBe('CC ···· 4817');

      const viewed = await call(
        'GET',
        `/api/child-dedications/${dedication.json<{ id: number }>().id}`,
        { user: 1, scope: 'C:10' },
      );
      expect(viewed.statusCode).toBe(200);
      expect(
        audit.entries.some(
          (entry) => entry.action === 'CHILD_DEDICATION_VIEWED',
        ),
      ).toBe(true);

      const foreign = await call(
        'GET',
        `/api/child-dedications/${dedication.json<{ id: number }>().id}`,
        { user: 2, scope: 'C:20' },
      );
      expect(foreign.statusCode).toBe(404);
      expect(
        (
          await call('GET', '/api/marriages', { user: 2, scope: 'C:20' })
        ).json(),
      ).toMatchObject({ total: 0 });
    });

    it('searches people with a required text and never reaches other denominations', async () => {
      const found = await call('GET', '/api/secretariat/people?q=Daniel', {
        user: 1,
        scope: 'C:10',
      });
      expect(
        found.json<{ fullName: string }[]>().map((person) => person.fullName),
      ).toEqual(['Daniel Herrera']);

      expect(
        (
          await call('GET', '/api/secretariat/people', {
            user: 1,
            scope: 'C:10',
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await call(
            'GET',
            '/api/secretariat/people?q=Daniel&eligibleFor=alien',
            { user: 1, scope: 'C:10' },
          )
        ).statusCode,
      ).toBe(400);
    });
  });
});
