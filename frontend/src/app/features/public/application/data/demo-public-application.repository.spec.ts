import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DomainError } from '../../../../core/errors/domain-error';
import { DemoPublicApplicationRepository } from './demo-public-application.repository';
import {
  ApplicationSubmission,
  MAX_SUBMISSIONS_PER_SESSION,
  todayIso,
} from './public-application.models';
import { PublicApplicationRepository } from './public-application.repository';
import { TRACKING_CODE_PATTERN, trackingPrefix } from './tracking-code';

function setup(): { repository: PublicApplicationRepository; db: DemoDatabase } {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [{ provide: PublicApplicationRepository, useClass: DemoPublicApplicationRepository }],
  });
  return { repository: TestBed.inject(PublicApplicationRepository), db: TestBed.inject(DemoDatabase) };
}

/** Birth date of someone who turns `age` this year (already had the birthday on Jan 1st). */
function birthDateForAge(age: number): string {
  return `${Number(todayIso().slice(0, 4)) - age}-01-01`;
}

function adultSubmission(overrides: Partial<ApplicationSubmission> = {}): ApplicationSubmission {
  return {
    congregationId: 1,
    policyId: 1,
    firstName: 'Valentina',
    lastName: 'Rojas',
    secondLastName: 'Pérez',
    documentTypeCode: 'CC',
    documentNumber: '1012345678',
    birthDate: birthDateForAge(30),
    sex: 'FEMALE',
    maritalStatusCode: 'SINGLE',
    phone: '300 456 7812',
    email: 'valentina.rojas@correo.example',
    address: 'Calle 45 Sur # 12-30',
    municipalityCode: '11001',
    guardian: null,
    consentAccepted: true,
    website: '',
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

describe('DemoPublicApplicationRepository', () => {
  it('lists only open congregations of active denominations', async () => {
    const { repository } = setup();
    const congregations = await firstValueFrom(repository.listOpenCongregations());

    // Soacha does not accept applications; Camino de Fe Cali and its denomination are inactive.
    expect(congregations.map((c) => c.id)).toEqual([1, 2, 4, 5]);
    expect(congregations[0].denominationName).toBe('Iglesia Cristiana Monte de Sion');
  });

  it('returns the current policy of the chosen denomination', async () => {
    const { repository } = setup();
    const policy = await firstValueFrom(repository.getCurrentPolicy(2));

    expect(policy.id).toBe(2);
    expect(policy.version).toBe('2026-1');
  });

  it('stores a PENDING application and returns only the tracking code', async () => {
    const { repository, db } = setup();
    const before = db.membershipApplications.length;

    const receipt = await firstValueFrom(repository.submit(adultSubmission()));

    expect(Object.keys(receipt)).toEqual(['trackingCode']);
    expect(receipt.trackingCode).toMatch(TRACKING_CODE_PATTERN);
    expect(receipt.trackingCode.startsWith('MS-')).toBe(true);
    const stored = db.membershipApplications.at(-1)!;
    expect(db.membershipApplications.length).toBe(before + 1);
    expect(stored.status).toBe('PENDING');
    expect(stored.trackingCode).toBe(receipt.trackingCode);
    expect(stored.consentedAt).toBeTruthy();
    expect(stored.formData.municipalityCode).toBe('11001');
    expect(stored.guardianName).toBeNull();
  });

  it('rejects a minor without a complete guardian', async () => {
    const { repository, db } = setup();
    const before = db.membershipApplications.length;
    const minor = adultSubmission({ birthDate: birthDateForAge(15), documentTypeCode: 'TI' });

    const missing = await failure(firstValueFrom(repository.submit(minor)));
    expect(missing.code).toBe('GUARDIAN_REQUIRED');

    const incomplete = await failure(
      firstValueFrom(
        repository.submit({ ...minor, guardian: { name: 'Ana María Rojas', document: '', relationship: 'Madre', phone: '310 278 4590' } }),
      ),
    );
    expect(incomplete.code).toBe('GUARDIAN_REQUIRED');
    expect(db.membershipApplications.length).toBe(before);
  });

  it('accepts a minor with a complete guardian', async () => {
    const { repository, db } = setup();
    const guardian = { name: 'Ana María Rojas', document: 'CC 52345678', relationship: 'Madre', phone: '310 278 4590' };

    await firstValueFrom(repository.submit(adultSubmission({ birthDate: birthDateForAge(16), guardian })));

    const stored = db.membershipApplications.at(-1)!;
    expect(stored.guardianName).toBe('Ana María Rojas');
    expect(stored.formData.guardianRelationship).toBe('Madre');
  });

  it('requires the data authorization', async () => {
    const { repository } = setup();
    const error = await failure(firstValueFrom(repository.submit(adultSubmission({ consentAccepted: false }))));

    expect(error.code).toBe('CONSENT_REQUIRED');
  });

  it('rejects a policy that is not the current one of the denomination', async () => {
    const { repository } = setup();
    const error = await failure(firstValueFrom(repository.submit(adultSubmission({ policyId: 2 }))));

    expect(error.code).toBe('POLICY_OUTDATED');
  });

  it('rejects congregations that do not accept applications', async () => {
    const { repository } = setup();
    const error = await failure(firstValueFrom(repository.submit(adultSubmission({ congregationId: 3 }))));

    expect(error.code).toBe('CONGREGATION_CLOSED');
  });

  it('limits the submissions of a browser session', async () => {
    const { repository } = setup();
    for (let i = 0; i < MAX_SUBMISSIONS_PER_SESSION; i++) {
      await firstValueFrom(repository.submit(adultSubmission({ documentNumber: `10000000${i}` })));
    }

    const error = await failure(firstValueFrom(repository.submit(adultSubmission())));
    expect(error.code).toBe('TOO_MANY_REQUESTS');
    expect(error.message).toBe('Has enviado varias solicitudes. Intenta más tarde.');
  });

  it('silently accepts a filled honeypot without storing anything', async () => {
    const { repository, db } = setup();
    const before = db.membershipApplications.length;
    const auditsBefore = db.auditLogs.length;

    const receipt = await firstValueFrom(
      repository.submit(adultSubmission({ website: 'https://spam.example', consentAccepted: false })),
    );

    expect(receipt.trackingCode).toMatch(TRACKING_CODE_PATTERN);
    expect(db.membershipApplications.length).toBe(before);
    expect(db.auditLogs.length).toBe(auditsBefore);
  });

  it('answers a status check with the status and dates only', async () => {
    const { repository } = setup();
    const status = await firstValueFrom(repository.checkStatus(' ms-7f3k-92qd '));

    expect(Object.keys(status).sort()).toEqual(['reviewedOn', 'status', 'statusLabel', 'submittedOn']);
    expect(status.statusLabel).toBe('En revisión');
    const serialized = JSON.stringify(status);
    for (const personal of ['Natalia', 'Vargas', '1032109876', 'Diagonal', '1993-11-09']) {
      expect(serialized).not.toContain(personal);
    }
  });

  it('finds an application right after submitting it', async () => {
    const { repository } = setup();
    const { trackingCode } = await firstValueFrom(repository.submit(adultSubmission()));

    const status = await firstValueFrom(repository.checkStatus(trackingCode));
    expect(status.status).toBe('PENDING');
    expect(status.reviewedOn).toBeNull();
  });

  it('answers an unknown code with a generic message', async () => {
    const { repository } = setup();
    const error = await failure(firstValueFrom(repository.checkStatus('MS-AAAA-BBBB')));

    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('No encontramos una solicitud con ese código.');
  });
});

describe('trackingPrefix', () => {
  it('uses the initials of the significant words of the denomination', () => {
    expect(trackingPrefix('Iglesia Cristiana Monte de Sion')).toBe('MS');
    expect(trackingPrefix('Comunidad Cristiana Vida Nueva')).toBe('VN');
    expect(trackingPrefix('Iglesia Evangélica Camino de Fe')).toBe('CF');
  });
});
