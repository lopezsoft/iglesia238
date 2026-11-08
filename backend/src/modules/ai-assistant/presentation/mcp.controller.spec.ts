import { HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import { UnauthenticatedException } from '../../../common/errors/domain.exception.js';
import { McpServer } from '../application/mcp/mcp-server.js';
import { AiToolCatalog } from '../application/tools/ai-tool-catalog.js';
import type { AuthenticateMcpTokenUseCase } from '../application/use-cases/authenticate-mcp-token.use-case.js';
import type { SmartLogger } from '../../../common/logging/smart-logger.service.js';
import { McpController } from './ai-assistant.controllers.js';

function build() {
  const execute = vi.fn();
  const code = vi.fn().mockReturnThis();
  const header = vi.fn().mockReturnThis();
  const reply = { code, header } as unknown as FastifyReply;
  const server = new McpServer(
    new AiToolCatalog([], { error: vi.fn() } as unknown as SmartLogger),
  );
  const controller = new McpController(
    { execute } as unknown as AuthenticateMcpTokenUseCase,
    server,
  );
  return { controller, execute, reply, code, header };
}

const TOKEN = 'i238_mcp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP';

describe('McpController', () => {
  it('authenticates with the bearer token and answers the JSON-RPC request', async () => {
    const { controller, execute, reply } = build();
    execute.mockResolvedValue(buildTenantContext());

    const answer = await controller.handle(
      `Bearer ${TOKEN}`,
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      reply,
    );

    expect(execute).toHaveBeenCalledWith(TOKEN);
    expect(answer).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it.each([
    [undefined],
    [''],
    ['Basic abc'],
    [`Bearer ${TOKEN} extra`],
    ['Bearer'],
  ])('does not find a token in the header %j', async (header) => {
    const { controller, execute, reply } = build();
    execute.mockImplementation((token: string | undefined) =>
      token === undefined
        ? Promise.reject(new UnauthenticatedException())
        : Promise.resolve(buildTenantContext()),
    );

    await expect(
      controller.handle(
        header,
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        reply,
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });

  it('answers 202 with no body to a notification', async () => {
    const { controller, execute, reply, code } = build();
    execute.mockResolvedValue(buildTenantContext());

    const answer = await controller.handle(
      `Bearer ${TOKEN}`,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      reply,
    );

    expect(answer).toBeUndefined();
    expect(code).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
  });

  it('does not run anything when the token is refused', async () => {
    const { controller, execute, reply } = build();
    execute.mockRejectedValue(new UnauthenticatedException());

    await expect(
      controller.handle(
        `Bearer ${TOKEN}`,
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        reply,
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });

  it('says that GET is not offered, and which method is', () => {
    const { controller, reply, code, header } = build();

    controller.notAllowed(reply);

    expect(code).toHaveBeenCalledWith(HttpStatus.METHOD_NOT_ALLOWED);
    expect(header).toHaveBeenCalledWith('Allow', 'POST');
  });
});
