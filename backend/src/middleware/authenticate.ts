import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { AuthService } from '../auth/authService';
import { HttpError } from './errorHandler';

/** Rejects requests without a valid `Authorization: Bearer <session token>` header. */
export function requireSession(authService: AuthService): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
    if (!token) {
      next(new HttpError(401, 'Missing session token'));
      return;
    }
    try {
      response.locals.userId = authService.verifySessionToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** The id of the user whose session authenticated this request (set by requireSession). */
export function authenticatedUserId(response: Response): string {
  const userId: unknown = response.locals.userId;
  if (typeof userId !== 'string') {
    throw new HttpError(401, 'Missing session token');
  }
  return userId;
}
