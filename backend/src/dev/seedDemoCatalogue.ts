/*
 * Loads the labelled Vancouver demo catalogue into MongoDB, so the app can be demoed without a
 * Google Places API key. Usage: `npm run seed:demo` (or, under Docker Compose,
 * `docker compose exec backend npm run seed:demo`).
 */
import { ActivityService } from '../activities/activityService';
import { env } from '../config/env';
import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { DEMO_VANCOUVER_PLACES } from './demoVancouverPlaces';

async function seed(): Promise<void> {
  await connectToDatabase(env.mongodbUri);
  try {
    const catalogue = await new ActivityService(null).importPlaces('Vancouver', DEMO_VANCOUVER_PLACES);
    console.info(`Seeded ${String(catalogue.activityCount)} demo activities for ${catalogue.displayName}`);
  } catch (error) {
    console.error('Seeding the demo catalogue failed', error);
    process.exitCode = 1;
  }
  await disconnectFromDatabase();
}

seed().catch((error: unknown) => {
  console.error('Could not connect to MongoDB to seed the demo catalogue', error);
  process.exitCode = 1;
});
