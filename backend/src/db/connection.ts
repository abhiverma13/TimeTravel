import mongoose from 'mongoose';

import { renameItinerariesToTrips } from './tripRename';

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri);
  await renameItinerariesToTrips(mongoose.connection);
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
