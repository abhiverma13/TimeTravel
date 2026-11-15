import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

/** MongoDB's error code for a write that would break a unique index. */
export const DUPLICATE_KEY_ERROR = 11000;

/** Whether a MongoDB write failed because another document already has the same unique value. */
export function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === DUPLICATE_KEY_ERROR;
}

/** A request field holding a MongoDB id; `what` names it in the error, as in "must be a group id". */
export function objectIdOf(what: string) {
  return z.string().refine((id) => isValidObjectId(id), `must be ${what} id`);
}
