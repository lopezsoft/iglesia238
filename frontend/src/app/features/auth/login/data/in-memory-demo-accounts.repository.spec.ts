import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DemoAccountsRepository } from './demo-accounts.repository';
import { InMemoryDemoAccountsRepository } from './in-memory-demo-accounts.repository';

function setup(): DemoAccountsRepository {
  TestBed.configureTestingModule({
    providers: [{ provide: DemoAccountsRepository, useClass: InMemoryDemoAccountsRepository }],
  });
  return TestBed.inject(DemoAccountsRepository);
}

describe('InMemoryDemoAccountsRepository', () => {
  it('lists only accounts that can sign in, with their current roles', async () => {
    const directory = await firstValueFrom(setup().getDirectory());
    const emails = directory.accounts.map((account) => account.email);

    expect(directory.password).toBe(DEMO_PASSWORD);
    expect(emails).toContain('laura.gomez@iglesia238.example');
    // Invitation still pending: cannot sign in yet.
    expect(emails).not.toContain('sofia.mejia@montedesion.example');

    const marta = directory.accounts.find((account) => account.email.startsWith('marta'))!;
    // Her treasurer role was revoked.
    expect(marta.roles.map((role) => role.roleCode)).toEqual(['SECRETARY']);
    expect(marta.roles[0].scopeLabel).toBe('Sede Central');
  });

  it('labels each scope and skips titles in the initials', async () => {
    const directory = await firstValueFrom(setup().getDirectory());
    const pastor = directory.accounts.find((account) => account.email.startsWith('daniel'))!;
    const admin = directory.accounts.find((account) => account.email.startsWith('laura'))!;

    expect(pastor.initials).toBe('DH');
    expect(admin.roles[0]).toEqual({
      roleCode: 'PLATFORM_ADMIN',
      roleName: 'Administrador de plataforma',
      scopeLabel: 'Plataforma',
    });
  });
});
