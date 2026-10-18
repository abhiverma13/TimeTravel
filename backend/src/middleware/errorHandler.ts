import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** An error whose message is safe to show to the client, with the HTTP status to send. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function isMalformedJsonError(error: unknown): boolean {
  return error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed';
}

export function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({ error: 'Not Found' });
}

export function errorHandler(error: unknown, _request: Request, response: Response, next: NextFunction): void {
  if (response.headersSent) {
    // Too late to send a JSON error; Express's default handler closes the connection.
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`);
    response.status(400).json({ error: 'Invalid request', details });
    return;
  }
  if (isMalformedJsonError(error)) {
    response.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error('Unhandled request error', error);
  response.status(500).json({ error: 'Internal server error' });
}
