import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ROLE_NAMES } from '../../../../core/auth/role';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { demoResponse } from '../../../../core/demo/demo-request';
import { User, UserRoleAssignment } from '../../../../core/models/identity.model';
import {
  DemoAccount,
  DemoAccountDirectory,
  DemoAccountRole,
  DemoAccountsRepository,
} from './demo-accounts.repository';

/** ADAPTER: reads the active demo users and their current roles from the demo database. */
@Injectable()
export class InMemoryDemoAccountsRepository extends DemoAccountsRepository {
  private readonly db = inject(DemoDatabase);

  getDirectory(): Observable<DemoAccountDirectory> {
    const accounts = this.db.users
      .filter((user) => user.isActive && !user.invitationPending)
      .map((user) => this.toAccount(user))
      .filter((account) => account.roles.length > 0);
    return demoResponse({ password: DEMO_PASSWORD, accounts });
  }

  private toAccount(user: User): DemoAccount {
    const roles = this.db.userRoles
      .filter((role) => role.userId === user.id && role.revokedAt === null)
      .map((role) => this.toRole(role));
    return {
      email: user.email,
      displayName: user.displayName,
      initials: initialsOf(user.displayName),
      roles,
    };
  }

  private toRole(role: UserRoleAssignment): DemoAccountRole {
    return { roleCode: role.role, roleName: ROLE_NAMES[role.role], scopeLabel: this.scopeLabel(role) };
  }

  private scopeLabel(role: UserRoleAssignment): string {
    switch (role.scope) {
      case 'PLATFORM':
        return 'Plataforma';
      case 'DENOMINATION':
        return this.db.denominations.find((item) => item.id === role.denominationId)?.name ?? 'Denominación';
      case 'CONGREGATION':
        return this.db.congregation(role.congregationId ?? 0)?.name ?? 'Sede';
    }
  }
}

/** Initials of the last two words, so titles such as "Pastor" are skipped. */
function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
