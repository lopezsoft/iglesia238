import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpMembersRepository } from './http-members.repository';
import { MemberFilters, MemberListQuery } from './members.models';
import { MembersRepository } from './members.repository';

const ALL: MemberFilters = {
  text: '',
  status: 'ALL',
  sex: 'ALL',
  ageRange: 'ALL',
  position: 'ALL',
  congregationId: null,
};
const QUERY: MemberListQuery = { ...ALL, page: 1, pageSize: 10, sortBy: 'name', order: 'asc' };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MembersRepository, useClass: HttpMembersRepository },
    ],
  });
  return {
    repository: TestBed.inject(MembersRepository),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('HttpMembersRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('list and export', () => {
    it('sends the paging and the sort, and only the filters that narrow the list', async () => {
      const { repository, http } = setup();

      const page = firstValueFrom(repository.list(QUERY));
      const request = http.expectOne((req) => req.url === '/api/members');
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('pageSize')).toBe('10');
      expect(request.request.params.get('sortBy')).toBe('name');
      expect(request.request.params.get('order')).toBe('asc');
      for (const name of ['text', 'status', 'sex', 'ageRange', 'position', 'congregationId']) {
        expect(request.request.params.has(name)).toBe(false);
      }
      const body = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        statusCounts: { ALL: 0, ACTIVE: 0, INACTIVE: 0, TRANSFERRED: 0, DECEASED: 0 },
      };
      request.flush(body);
      expect(await page).toEqual(body);
    });

    it('maps every filter to its query parameter', () => {
      const { repository, http } = setup();

      repository
        .list({
          ...QUERY,
          text: ' ana ',
          status: 'INACTIVE',
          sex: 'FEMALE',
          ageRange: 'SENIORS',
          position: 6,
          congregationId: 2,
          sortBy: 'age',
          order: 'desc',
        })
        .subscribe();
      const { params } = http.expectOne((req) => req.url === '/api/members').request;

      expect(params.get('text')).toBe('ana');
      expect(params.get('status')).toBe('INACTIVE');
      expect(params.get('sex')).toBe('FEMALE');
      expect(params.get('ageRange')).toBe('SENIORS');
      expect(params.get('position')).toBe('6');
      expect(params.get('congregationId')).toBe('2');
      expect(params.get('sortBy')).toBe('age');
      expect(params.get('order')).toBe('desc');
    });

    it('downloads the export as a Blob with the same filters', async () => {
      const { repository, http } = setup();

      const file = firstValueFrom(repository.exportCsv({ ...ALL, status: 'ACTIVE' }));
      const request = http.expectOne((req) => req.url === '/api/members/export');
      expect(request.request.responseType).toBe('blob');
      expect(request.request.params.get('status')).toBe('ACTIVE');
      request.flush(new Blob(['x'], { type: 'text/csv' }));

      expect((await file).type).toBe('text/csv');
    });

    it('reads the position catalog', () => {
      const { repository, http } = setup();

      repository.positionCatalog().subscribe();

      expect(http.expectOne('/api/church-positions').request.method).toBe('GET');
    });
  });

  describe('registration and status', () => {
    it('creates a member with the body as given', () => {
      const { repository, http } = setup();
      const input = {
        congregationId: 1,
        existingPersonId: 9,
        person: null,
        joinedOn: null,
        isBaptized: null,
        waterBaptismOn: null,
        baptismPlace: null,
        previousCongregationName: null,
        registryBook: null,
        registryFolio: null,
        guardianPersonId: null,
        consentAccepted: true,
      };

      repository.createMember(input).subscribe();
      const request = http.expectOne('/api/members');

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(input);
    });

    it('searches people who are not members yet with the text trimmed', () => {
      const { repository, http } = setup();

      repository.searchCandidates(' Pedro ').subscribe();
      const { request } = http.expectOne((req) => req.url === '/api/members/candidates');

      expect(request.params.get('q')).toBe('Pedro');
    });

    it('searches adults who can be guardians', () => {
      const { repository, http } = setup();

      repository.searchGuardians('Madre').subscribe();
      const { request } = http.expectOne((req) => req.url === '/api/members/guardians');

      expect(request.params.get('q')).toBe('Madre');
      expect(request.params.get('limit')).toBe('8');
    });

    it('changes the status, the membership data and the person with their own routes', () => {
      const { repository, http } = setup();

      repository
        .changeStatus(4, { status: 'INACTIVE', reason: 'Se mudó', effectiveOn: null })
        .subscribe();
      const status = http.expectOne('/api/members/4/status');
      expect(status.request.method).toBe('POST');
      expect(status.request.body).toEqual({
        status: 'INACTIVE',
        reason: 'Se mudó',
        effectiveOn: null,
      });

      repository.updateMembership(4, { isBaptized: true }).subscribe();
      const membership = http.expectOne('/api/members/4/membership');
      expect(membership.request.method).toBe('PATCH');
      expect(membership.request.body).toEqual({ isBaptized: true });

      repository.detail(4).subscribe();
      expect(http.expectOne('/api/members/4').request.method).toBe('GET');
    });
  });

  describe('family, studies and positions', () => {
    it('searches relatives of the member', () => {
      const { repository, http } = setup();

      repository.searchRelatives(4, 'Ruiz').subscribe();
      const { request } = http.expectOne((req) => req.url === '/api/members/4/family/candidates');

      expect(request.params.get('q')).toBe('Ruiz');
    });

    it('adds and removes relations, studies and positions', () => {
      const { repository, http } = setup();

      repository.addFamilyRelation(4, { relativeId: 9, type: 'CHILD' }).subscribe();
      expect(http.expectOne('/api/members/4/family').request.body).toEqual({
        relativeId: 9,
        type: 'CHILD',
      });
      repository.removeFamilyRelation(4, 7).subscribe();
      expect(http.expectOne('/api/members/4/family/7').request.method).toBe('DELETE');

      repository.removeStudy(4, 3).subscribe();
      expect(http.expectOne('/api/members/4/studies/3').request.method).toBe('DELETE');

      repository.assignPosition(4, { positionId: 6, startedOn: '2026-01-01' }).subscribe();
      expect(http.expectOne('/api/members/4/positions').request.method).toBe('POST');
      repository.closePosition(4, 8, '2026-11-02').subscribe();
      const close = http.expectOne('/api/members/4/positions/8/close');
      expect(close.request.body).toEqual({ endedOn: '2026-11-02' });
      repository.setPastoralRank(4, null).subscribe();
      const rank = http.expectOne('/api/members/4/pastoral-rank');
      expect(rank.request.method).toBe('PUT');
      expect(rank.request.body).toEqual({ pastoralRankId: null });
    });
  });

  describe('sensitive data and transfers', () => {
    it('reads and saves the socioeconomic profile', async () => {
      const { repository, http } = setup();

      const profile = firstValueFrom(repository.socioeconomicProfile(4));
      http.expectOne('/api/members/4/socioeconomic-profile').flush(null);
      expect(await profile).toBeNull();

      const input = {
        hasHealthCoverage: true,
        hasPension: null,
        hasOccupationalRiskCoverage: null,
        isSubsidizedRegime: null,
        hasFamilyCompensation: null,
        sisbenLevel: 2,
        isDisplaced: false,
      };
      repository.saveSocioeconomicProfile(4, input).subscribe();
      const put = http.expectOne('/api/members/4/socioeconomic-profile');
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual(input);
    });

    it('posts the transfer and reads the destinations and the registry', async () => {
      const { repository, http } = setup();

      const result = firstValueFrom(
        repository.transfer(4, {
          kind: 'INTERNAL',
          destinationCongregationId: 2,
          transferDate: '2026-11-02',
          reason: 'Cambio de residencia',
        }),
      );
      const post = http.expectOne('/api/members/4/transfers');
      expect(post.request.body).toMatchObject({ kind: 'INTERNAL', destinationCongregationId: 2 });
      post.flush({ kind: 'INTERNAL', destinationName: 'Sede Norte', stillVisible: false });
      expect((await result).stillVisible).toBe(false);

      repository.transferDestinations(4).subscribe();
      http.expectOne('/api/members/4/transfer-destinations').flush([]);
      repository.registry(4).subscribe();
      http
        .expectOne('/api/members/4/registry')
        .flush({ entries: [], transfers: [], statusHistory: [] });
    });

    it('revokes a consent and anonymizes with empty POST bodies', () => {
      const { repository, http } = setup();

      repository.revokeConsent(4, 11).subscribe();
      const revoke = http.expectOne('/api/members/4/consents/11/revoke');
      expect(revoke.request.method).toBe('POST');
      repository.anonymize(4).subscribe();
      expect(http.expectOne('/api/members/4/anonymize').request.method).toBe('POST');
    });
  });
});
