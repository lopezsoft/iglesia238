import { Observable } from 'rxjs';
import { PersonOption } from '../../data/accounting.models';
import { ExportedFile } from '../../data/accounting-http';
import {
  CreateVowPledgeCommand,
  UpdateVowPledgeCommand,
  VowFilters,
  VowPledgeDetail,
  VowPledgeRow,
  VowsOverview,
  VowsQuery,
} from './vows.models';

/**
 * Port of Votos (E-03): vow pledges with their computed payments and balance. Reading needs
 * contributions.read; creating, editing and cancelling need contributions.write and a sede scope.
 * Payments are contributions of type VOW, recorded in Aportes.
 */
export abstract class VowsRepository {
  /** One page of pledges (filters applied by the server) with the KPIs and the counts per status. */
  abstract overview(query: VowsQuery): Observable<VowsOverview>;
  abstract detail(pledgeId: number): Observable<VowPledgeDetail>;
  abstract create(command: CreateVowPledgeCommand): Observable<VowPledgeRow>;
  abstract update(pledgeId: number, command: UpdateVowPledgeCommand): Observable<VowPledgeRow>;
  /** Cancels an active pledge; its payments stay. */
  abstract cancel(pledgeId: number, reason: string): Observable<VowPledgeRow>;
  abstract searchPersons(query: string): Observable<PersonOption[]>;
  abstract exportCsv(filters: VowFilters): Observable<ExportedFile>;
}
