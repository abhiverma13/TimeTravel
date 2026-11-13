import type { Connection } from 'mongoose';

/** Collections whose documents pointed at a trip through `itineraryId` before trips were called trips. */
const TRIP_REFERENCES = ['posts', 'suggestions', 'joinrequests'];

/**
 * Moves data stored before the rename: the `itineraries` collection becomes `trips`, and every `itineraryId`
 * field becomes `tripId`, with indexes on the old field dropped. Runs on every start and does nothing once
 * applied. The models are initialised first, so the empty `trips` collection Mongoose creates is the one the
 * old data replaces; a `trips` collection that already holds trips is never touched.
 */
export async function renameItinerariesToTrips(connection: Connection): Promise<void> {
  await Promise.all(Object.values(connection.models).map((model) => model.init()));
  const db = connection.db;
  if (!db) {
    return;
  }
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((collection) => collection.name));
  if (names.has('itineraries')) {
    const tripsAlreadyStored = names.has('trips') && (await db.collection('trips').estimatedDocumentCount()) > 0;
    if (!tripsAlreadyStored) {
      await db.renameCollection('itineraries', 'trips', { dropTarget: true });
    }
  }
  for (const name of TRIP_REFERENCES.filter((collectionName) => names.has(collectionName))) {
    const collection = db.collection(name);
    await collection.updateMany({ itineraryId: { $exists: true } }, { $rename: { itineraryId: 'tripId' } });
    const staleIndexes = (await collection.indexes()).filter((index) => 'itineraryId' in index.key);
    for (const index of staleIndexes) {
      if (index.name) {
        await collection.dropIndex(index.name);
      }
    }
  }
}
