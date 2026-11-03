import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
} from '../../attendance/testing/test-doubles.js';
import {
  GetChildDedication,
  ListChildDedications,
  RecordChildDedication,
} from '../application/use-cases/child-dedication.use-cases.js';
import {
  DissolveMarriage,
  GetMarriage,
  ListMarriages,
  RecordMarriage,
} from '../application/use-cases/marriage.use-cases.js';
import {
  ClosePastoralTerm,
  ListPastoralTerms,
  RecordPastoralTerm,
} from '../application/use-cases/pastoral-term.use-cases.js';
import {
  GetRecordsContext,
  GetRecordsSummary,
  SearchRecordPeople,
} from '../application/use-cases/records-overview.use-cases.js';
import {
  FakeCongregationDirectory,
  FakePeopleDirectory,
  FakePeopleSearch,
  FakeRecordsWorld,
  InMemoryChildDedicationRepository,
  InMemoryMarriageRepository,
  InMemoryPastoralTermRepository,
  TODAY,
} from './in-memory-records.js';

export const RECORDS_PERMISSIONS = ['members.write'];

/** Every use case of the module wired to in-memory ports, in a world with two denominations. */
export function buildRecordsFixture() {
  const world = new FakeRecordsWorld();
  const congregations = new FakeCongregationDirectory();
  const people = new FakePeopleDirectory(world);
  const search = new FakePeopleSearch(world);
  const dedications = new InMemoryChildDedicationRepository(world);
  const marriages = new InMemoryMarriageRepository(world);
  const terms = new InMemoryPastoralTermRepository(world);
  const audit = new FakeAuditRecorder();
  const transactions = new FakeTransactionRunner();
  const clock = FixedClock.at(TODAY);

  return {
    world,
    terms,
    audit,
    transactions,
    useCases: {
      context: new GetRecordsContext(congregations, clock),
      summary: new GetRecordsSummary(
        dedications,
        marriages,
        terms,
        congregations,
        clock,
      ),
      searchPeople: new SearchRecordPeople(search),
      listDedications: new ListChildDedications(dedications),
      getDedication: new GetChildDedication(dedications, audit),
      recordDedication: new RecordChildDedication(
        dedications,
        congregations,
        people,
        transactions,
        audit,
        clock,
      ),
      listMarriages: new ListMarriages(marriages),
      getMarriage: new GetMarriage(marriages),
      recordMarriage: new RecordMarriage(
        marriages,
        people,
        transactions,
        audit,
        clock,
      ),
      dissolveMarriage: new DissolveMarriage(
        marriages,
        transactions,
        audit,
        clock,
      ),
      listTerms: new ListPastoralTerms(terms),
      recordTerm: new RecordPastoralTerm(
        terms,
        congregations,
        people,
        transactions,
        audit,
      ),
      closeTerm: new ClosePastoralTerm(terms, transactions, audit, clock),
    },
  };
}

export type RecordsFixture = ReturnType<typeof buildRecordsFixture>;
