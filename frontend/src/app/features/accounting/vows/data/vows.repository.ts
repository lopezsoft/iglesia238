import { Observable } from 'rxjs';
import { PersonOption } from '../../data/accounting.models';
import { CreateVowPledgeCommand, VowPledgeDetail, VowPledgeRow, VowsOverview } from './vows.models';

/**
 * Port of Votos (E-03): vow pledges with their computed payments and balance. Reading needs
 * contributions.read; creating a pledge needs contributions.write and a sede scope. Payments
 * are contributions of type VOW, recorded in Aportes.
 */
export abstract class VowsRepository {
  abstract overview(): Observable<VowsOverview>;
  abstract detail(pledgeId: number): Observable<VowPledgeDetail>;
  abstract create(command: CreateVowPledgeCommand): Observable<VowPledgeRow>;
  abstract searchPersons(query: string): Observable<PersonOption[]>;
}
