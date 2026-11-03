import { StreamableFile } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/** A file name that is safe inside a Content-Disposition header. */
export function safeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, '_');
}

/** Sends a generated PDF inline. The body is private: it carries personal data, so it is never cached. */
export function sendPdf(
  reply: FastifyReply,
  file: { filename: string; content: Buffer },
): StreamableFile {
  void reply
    .header('Content-Type', 'application/pdf')
    .header(
      'Content-Disposition',
      `inline; filename="${safeFilename(file.filename)}"`,
    )
    .header('Cache-Control', 'private, no-store');
  return new StreamableFile(file.content);
}

export function sendCsv(
  reply: FastifyReply,
  file: { filename: string; content: string },
): string {
  void reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header(
      'Content-Disposition',
      `attachment; filename="${safeFilename(file.filename)}"`,
    )
    .header('Cache-Control', 'private, no-store');
  return file.content;
}
