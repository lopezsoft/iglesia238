import { Observable } from 'rxjs';
import { RoleCode } from '../../../../core/auth/role';

/** A role of a demo account and where it applies. */
export interface DemoAccountRole {
  readonly roleCode: RoleCode;
  readonly roleName: string;
  readonly scopeLabel: string;
}

/** A demo user that can sign in, shown in the "Modo demostración" panel. */
export interface DemoAccount {
  readonly email: string;
  readonly displayName: string;
  readonly initials: string;
  readonly roles: readonly DemoAccountRole[];
}

export interface DemoAccountDirectory {
  /** Shared password of every demo account (fictional, demo mode only). */
  readonly password: string;
  readonly accounts: readonly DemoAccount[];
}

/**
 * PORT: lists the accounts a visitor can try in demo mode. It has no API counterpart: the
 * panel that uses it only renders when `environment.demoMode` is on.
 */
export abstract class DemoAccountsRepository {
  abstract getDirectory(): Observable<DemoAccountDirectory>;
}
