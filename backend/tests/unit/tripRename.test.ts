import mongoose, { Types } from 'mongoose';

import { renameItinerariesToTrips } from '../../src/db/tripRename';
import { SuggestionModel } from '../../src/disruptions/suggestionModel';
import { TripModel } from '../../src/trips/tripModel';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

function database(): mongoose.mongo.Db {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('The test database is not connected');
  }
  return db;
}

async function collectionNames(): Promise<string[]> {
  return (await database().listCollections({}, { nameOnly: true }).toArray()).map((collection) => collection.name);
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  await database().dropCollection('itineraries').catch(() => undefined);
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

describe('renameItinerariesToTrips', () => {
  // Data stored before CP3: a trip in `itineraries`, a post and a suggestion pointing at it through `itineraryId`,
  // and the suggestion index on that old field.
  test('Moves trips to `trips` and every itineraryId to tripId', async () => {
    const tripId = new Types.ObjectId();
    await database().collection('itineraries').insertOne({ _id: tripId, city: 'Vancouver' });
    await database().collection('posts').insertOne({ itineraryId: tripId, caption: 'Great day' });
    await database().collection('suggestions').insertOne({ itineraryId: tripId, status: 'pending' });
    await database().collection('suggestions').createIndex({ itineraryId: 1, status: 1, activityId: 1 });

    await renameItinerariesToTrips(mongoose.connection);

    expect(await collectionNames()).not.toContain('itineraries');
    expect((await TripModel.findById(tripId).lean())?.city).toBe('Vancouver');
    expect(await database().collection('posts').findOne({})).toMatchObject({ tripId, caption: 'Great day' });
    expect(await database().collection('posts').countDocuments({ itineraryId: { $exists: true } })).toBe(0);
    expect(await SuggestionModel.countDocuments({ tripId })).toBe(1);
    const suggestionIndexes = await database().collection('suggestions').indexes();
    expect(suggestionIndexes.some((index) => 'itineraryId' in index.key)).toBe(false);
  });

  test('Never replaces a trips collection that already holds trips', async () => {
    const current = await TripModel.collection.insertOne({ city: 'Vancouver' });
    await database().collection('itineraries').insertOne({ city: 'Seattle' });

    await renameItinerariesToTrips(mongoose.connection);

    expect(await TripModel.countDocuments({ _id: current.insertedId })).toBe(1);
    expect(await database().collection('itineraries').countDocuments()).toBe(1);
  });

  test('Does nothing once applied', async () => {
    await TripModel.collection.insertOne({ city: 'Vancouver' });

    await renameItinerariesToTrips(mongoose.connection);
    await renameItinerariesToTrips(mongoose.connection);

    expect(await TripModel.countDocuments()).toBe(1);
    expect(await collectionNames()).not.toContain('itineraries');
  });
});
