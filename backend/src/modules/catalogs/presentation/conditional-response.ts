import { HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Answers a cacheable GET with an ETag: when the browser already has that exact content, the reply is
 * a 304 without body and the caller gets `undefined`. Catalogs change only with a new seed, so this
 * saves most of the traffic.
 */
export function respondCacheable<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  body: T,
  cacheControl: string,
): T | undefined {
  const etag = `W/"${createHash('sha1').update(JSON.stringify(body)).digest('base64url')}"`;
  void reply.header('ETag', etag).header('Cache-Control', cacheControl);

  if (request.headers['if-none-match'] === etag) {
    void reply.status(HttpStatus.NOT_MODIFIED);
    return undefined;
  }
  return body;
}

export const PRIVATE_CACHE = 'private, max-age=3600';
export const PUBLIC_CACHE = 'public, max-age=3600';
