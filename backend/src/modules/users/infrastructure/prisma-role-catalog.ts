import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { RoleCatalog, RoleRecord } from '../application/users.ports.js';

@Injectable()
export class PrismaRoleCatalog implements RoleCatalog {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RoleRecord[]> {
    const rows = await this.prisma.role.findMany({
      orderBy: { id: 'asc' },
      select: {
        code: true,
        name: true,
        description: true,
        rolePermissions: {
          select: { permission: { select: { code: true, description: true } } },
        },
      },
    });
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      permissions: row.rolePermissions
        .map((link) => link.permission)
        .sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }

  async exists(code: string): Promise<boolean> {
    return (await this.prisma.role.count({ where: { code } })) > 0;
  }
}
