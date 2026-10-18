import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../../src/db/connection';

// The first run downloads a MongoDB binary, which can take longer than Jest's default timeout.
export const DATABASE_STARTUP_TIMEOUT_MS = 120_000;

let memoryServer: MongoMemoryServer | undefined;

/** Starts a throwaway in-memory MongoDB and connects Mongoose to it. */
export async function startTestDatabase(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  await connectToDatabase(memoryServer.getUri());
}

/** Removes every document so each test starts from an empty database. */
export async function clearTestDatabase(): Promise<void> {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
}

export async function stopTestDatabase(): Promise<void> {
  await disconnectFromDatabase();
  await memoryServer?.stop();
  memoryServer = undefined;
}
