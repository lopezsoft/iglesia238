import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaAuditActivityReader } from './prisma-audit-activity.reader.js';

const row = (id: number, userId: number | null) => ({
  id: BigInt(id),
  userId,
  denominationId: 1,
  congregationId: null,
  entity: 'Member',
  action: 'CREATE',
  createdAt: new Date('2026-11-02T15:00:00.000Z'),
});

function readerWith() {
  const prisma = {
    auditLog: { findMany: vi.fn().mockResolvedValue([row(1, 7), row(2, 8)]) },
    user: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 7,
          displayName: 'Ana Plataforma',
          email: 'ana@plataforma.example',
          roleAssignments: [{ id: 1 }],
        },
        {
          id: 8,
          displayName: 'Beto Pastor',
          email: 'beto@iglesia.example',
          roleAssignments: [],
        },
      ]),
    },
    congregation: { findMany: vi.fn().mockResolvedValue([]) },
    denomination: {
      findMany: vi.fn().mockResolvedValue([{ id: 1, name: 'Monte de Sion' }]),
    },
  };
  return new PrismaAuditActivityReader(prisma as unknown as PrismaService);
}

describe('PrismaAuditActivityReader.recent', () => {
  it('shows a denomination platform staff as one party, like the audit log screen', async () => {
    const rows = await readerWith().recent(
      { denominationId: 1, congregationId: null },
      5,
    );

    expect(rows.map((r) => r.userName)).toEqual([
      'Equipo de plataforma',
      'Beto Pastor',
    ]);
  });

  it('lets the platform see the real names', async () => {
    const rows = await readerWith().recent(
      { denominationId: null, congregationId: null },
      5,
    );

    expect(rows.map((r) => r.userName)).toEqual([
      'Ana Plataforma',
      'Beto Pastor',
    ]);
  });
});
