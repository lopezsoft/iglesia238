import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import {
  InviteUserUseCase,
  IssueUserLinkUseCase,
} from './application/invitations.use-cases.js';
import {
  GrantRoleUseCase,
  RevokeRoleUseCase,
} from './application/role-commands.use-cases.js';
import {
  GetGrantContextUseCase,
  ListRolesUseCase,
  ListUsersUseCase,
} from './application/user-queries.use-cases.js';
import {
  APP_LINKS,
  GRANT_SCOPE_READER,
  ROLE_CATALOG,
  USER_DIRECTORY,
  USER_LINK_STORE,
} from './application/users.ports.js';
import { ConfigAppLinks } from './infrastructure/config-app-links.js';
import { PrismaGrantScopeReader } from './infrastructure/prisma-grant-scope.reader.js';
import { PrismaRoleCatalog } from './infrastructure/prisma-role-catalog.js';
import { PrismaUserDirectory } from './infrastructure/prisma-user.directory.js';
import { PrismaUserLinkStore } from './infrastructure/prisma-user-link.store.js';
import {
  RolesController,
  UserRolesController,
  UsersController,
} from './presentation/users.controllers.js';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController, UserRolesController, RolesController],
  providers: [
    ListUsersUseCase,
    GetGrantContextUseCase,
    ListRolesUseCase,
    GrantRoleUseCase,
    RevokeRoleUseCase,
    InviteUserUseCase,
    IssueUserLinkUseCase,
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
    { provide: ROLE_CATALOG, useClass: PrismaRoleCatalog },
    { provide: GRANT_SCOPE_READER, useClass: PrismaGrantScopeReader },
    { provide: USER_LINK_STORE, useClass: PrismaUserLinkStore },
    { provide: APP_LINKS, useClass: ConfigAppLinks },
  ],
})
export class UsersModule {}
