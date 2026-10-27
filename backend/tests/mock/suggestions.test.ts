import { Types } from 'mongoose';
import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import { type BusinessStatus, GooglePlacesClient, type PlacesClient } from '../../src/activities/placesClient';
import type { SuggestionDto } from '../../src/disruptions/disruptionService';
import { SuggestionModel } from '../../src/disruptions/suggestionModel';
import { type Forecast, OpenWeatherClient, type WeatherClient } from '../../src/disruptions/weatherClient';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import { type TestAppOptions, createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

const SATURDAY_MORNING = new Date('2026-10-24T08:00:00Z');
const TRIP = ['Morning Bakery', 'Harbour Park', 'Town Museum'];

// A forecast for Testville (on UTC) with this chance of rain all of Saturday.
function forecastWithRain(chance: number): Forecast {
  return {
    utcOffsetSeconds: 0,
    slots: Array.from({ length: 8 }, (_, slot) => ({
      start: new Date(Date.UTC(2026, 9, 24, slot * 3)),
      end: new Date(Date.UTC(2026, 9, 24, slot * 3 + 3)),
      precipitationChance: chance,
      condition: chance >= 0.6 ? 'Rain' : 'Clouds',
    })),
  };
}

function weather(forecast: () => Promise<Forecast>): WeatherClient & { forecast: jest.Mock } {
  return { forecast: jest.fn(forecast) };
}

// A Places client whose only working call is the business status: Town Museum is closed, everything else open.
function placesWithClosedMuseum(): PlacesClient & { businessStatus: jest.Mock } {
  return {
    searchText: async () => Promise.reject(new Error('Not used: Testville is already stored')),
    businessStatus: jest.fn(async (placeId: string): Promise<BusinessStatus> =>
      Promise.resolve(placeId === 'testville-museum' ? 'CLOSED_TEMPORARILY' : 'OPERATIONAL'),
    ),
  };
}

// Pia's Saturday trip in Testville; the server clock is Saturday morning unless `now` says otherwise.
async function tripUnderWay(options: TestAppOptions = {}) {
  const testApp = createTestApp({ now: () => SATURDAY_MORNING, ...options });
  await seedTestville(testApp.activityService);
  const pia = await signedInUser(testApp.authService, 'Pia Planner');
  const itineraryId = await storeTestvilleTrip(pia.userId, TRIP);
  const pushed: SuggestionDto[] = [];
  testApp.disruptionService.onSuggestion((suggestion) => pushed.push(suggestion));
  return { ...testApp, pia, itineraryId, pushed };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface Disruption timer: checkActiveTrips()
describe('Mocked: Disruption timer: checkActiveTrips()', () => {
  // Mocked behavior: OpenWeather forecasts a 90% chance of rain all Saturday
  // Input: the timer runs twice on Saturday morning
  // Expected status code: none (timer)
  // Expected behavior: only the outdoor stop (Harbour Park) gets a suggestion, pushed to the members once; the second run
  //                    adds nothing while it waits for an answer
  // Expected output: one rain suggestion swapping Harbour Park for an indoor activity
  test('Rain on an outdoor stop', async () => {
    const { disruptionService, pushed } = await tripUnderWay({ weatherClient: weather(async () => Promise.resolve(forecastWithRain(0.9))) });

    const made = [await disruptionService.checkActiveTrips(), await disruptionService.checkActiveTrips()];

    expect(made).toEqual([1, 0]);
    expect(pushed.map((suggestion) => [suggestion.reason, suggestion.activityName])).toEqual([['rain', 'Harbour Park']]);
    expect(pushed.at(0)?.proposedStops).not.toContain('Harbour Park');
  });

  // Mocked behavior: a 20% chance of rain, and Google says Town Museum is temporarily closed
  // Input: the timer runs twice on Saturday morning
  // Expected status code: none (timer)
  // Expected behavior: the closed venue gets a suggestion; Google is asked about each venue once, then the answer is reused
  // Expected output: one "closed" suggestion for Town Museum; 3 status lookups in all
  test('A closed venue', async () => {
    const places = placesWithClosedMuseum();
    const { disruptionService, pushed } = await tripUnderWay({ weatherClient: weather(async () => Promise.resolve(forecastWithRain(0.2))), placesClient: places });

    await disruptionService.checkActiveTrips();
    await disruptionService.checkActiveTrips();

    expect(pushed.map((suggestion) => [suggestion.reason, suggestion.message])).toEqual([
      ['closed', expect.stringMatching(/^Town Museum is closed\./)],
    ]);
    expect(places.businessStatus).toHaveBeenCalledTimes(3);
  });

  // Mocked behavior: OpenWeather fails, or Google's status lookup fails
  // Input: the timer runs on Saturday morning
  // Expected status code: none (timer)
  // Expected behavior: the failure is logged and that check is skipped; the timer keeps going
  // Expected output: no suggestions
  test.each(['weather', 'venue status'])('The %s service fails', async (failing) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const places = placesWithClosedMuseum();
    places.businessStatus.mockRejectedValue(new Error('Places is down'));
    const options: TestAppOptions =
      failing === 'weather' ? { weatherClient: weather(async () => Promise.reject(new Error('OpenWeather is down'))) } : { placesClient: places };
    const { disruptionService, pushed } = await tripUnderWay(options);

    const made = await disruptionService.checkActiveTrips();

    expect(made).toBe(0);
    expect(pushed).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  // Mocked behavior: reading one trip's waiting suggestions fails
  // Input: two trips under way in the rain
  // Expected status code: none (timer)
  // Expected behavior: the failure is logged and the other trip is still checked
  // Expected output: one suggestion, for the other trip
  test("One trip's failure does not stop the others", async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { disruptionService, pia, pushed } = await tripUnderWay({ weatherClient: weather(async () => Promise.resolve(forecastWithRain(0.9))) });
    await storeTestvilleTrip(pia.userId, TRIP);
    jest.spyOn(SuggestionModel, 'countDocuments').mockRejectedValueOnce(new Error('Simulated database outage'));

    const made = await disruptionService.checkActiveTrips();

    expect(made).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(error).toHaveBeenCalledWith('Disruption check failed for an itinerary', expect.any(Error));
  });

  // Mocked behavior: rain is forecast, but the server clock is two weeks after the trip
  // Input: the timer runs
  // Expected status code: none (timer)
  // Expected behavior: trips no longer under way are not checked at all
  // Expected output: no suggestions, and no forecast requested
  test('Trips not under way are skipped', async () => {
    const forecasts = weather(async () => Promise.resolve(forecastWithRain(0.9)));
    const { disruptionService } = await tripUnderWay({ weatherClient: forecasts, now: () => new Date('2026-11-07T08:00:00Z') });

    expect(await disruptionService.checkActiveTrips()).toBe(0);
    expect(forecasts.forecast).not.toHaveBeenCalled();
  });
});

// Interface GET /api/suggestions
describe('Mocked: GET /api/suggestions', () => {
  // Mocked behavior: reading the suggestions fails
  // Input: Pia's trip
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Suggestion database fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, pia, itineraryId } = await tripUnderWay();
    jest.spyOn(SuggestionModel, 'find').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).get(`/api/suggestions?itineraryId=${itineraryId}`).set(pia.authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// A rain suggestion for Harbour Park on Pia's trip, made directly, and its id.
async function harbourParkSuggestion() {
  const setup = await tripUnderWay();
  const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
  await setup.disruptionService.suggest(new Types.ObjectId(setup.itineraryId), 0, parkId, 'rain');
  const suggestionId = setup.pushed.at(0)?.id ?? '';
  return { ...setup, suggestionId };
}

// Interface POST /api/suggestions/:suggestionId/accept
describe('Mocked: POST /api/suggestions/:suggestionId/accept', () => {
  // Mocked behavior: another member's change is saved between the version check and saving the proposed day
  // Input: Pia accepts the suggestion
  // Expected status code: 409
  // Expected behavior: the proposal is not saved over the other change, and the suggestion lapses
  // Expected output: { error: "The trip changed since this suggestion; it no longer applies" }
  test('Someone else changes the trip at the same moment', async () => {
    const { app, pia, suggestionId } = await harbourParkSuggestion();
    jest.spyOn(ItineraryModel, 'findOneAndUpdate').mockResolvedValueOnce(null);

    const response = await request(app).post(`/api/suggestions/${suggestionId}/accept`).set(pia.authorization);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'The trip changed since this suggestion; it no longer applies' });
    expect((await SuggestionModel.findById(suggestionId))?.status).toBe('expired');
  });

  // Mocked behavior: saving the answer fails after the day was saved
  // Input: Pia accepts the suggestion
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Suggestion database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, pia, suggestionId } = await harbourParkSuggestion();
    jest.spyOn(SuggestionModel.prototype, 'save').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).post(`/api/suggestions/${suggestionId}/accept`).set(pia.authorization);

    expect(response.status).toBe(500);
  });
});

// Interface POST /api/suggestions/:suggestionId/dismiss
describe('Mocked: POST /api/suggestions/:suggestionId/dismiss', () => {
  // Mocked behavior: saving the answer fails
  // Input: Pia dismisses the suggestion
  // Expected status code: 500
  // Expected behavior: the suggestion stays waiting
  // Expected output: { error: "Internal server error" }
  test('Suggestion database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, pia, suggestionId } = await harbourParkSuggestion();
    jest.spyOn(SuggestionModel.prototype, 'save').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).post(`/api/suggestions/${suggestionId}/dismiss`).set(pia.authorization);

    expect(response.status).toBe(500);
    expect((await SuggestionModel.findById(suggestionId))?.status).toBe('pending');
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// What OpenWeather's 5-day forecast says for Testville: rain all Saturday (UTC), and Google's answer about Town Museum.
function fakeGoogleAndOpenWeather(input: string | URL | Request): Response {
  const url = input instanceof Request ? input.url : input.toString();
  if (url.startsWith('https://api.openweathermap.org/')) {
    return jsonResponse({
      city: { timezone: 0 },
      list: Array.from({ length: 8 }, (_, slot) => ({ dt: Date.UTC(2026, 9, 24, slot * 3) / 1000, pop: 0.95, weather: [{ main: 'Rain' }] })),
    });
  }
  return jsonResponse({ businessStatus: url.includes('testville-museum') ? 'CLOSED_PERMANENTLY' : 'OPERATIONAL' });
}

// Interface Disruption timer: checkActiveTrips(), through the production clients
describe('Mocked: Disruption timer: checkActiveTrips() via OpenWeatherClient and GooglePlacesClient', () => {
  // Mocked behavior: fetch answers as OpenWeather (rain all Saturday) and as Places details (Town Museum closed)
  // Input: the timer runs on Saturday morning
  // Expected status code: none (timer)
  // Expected behavior: the real clients' requests are understood; the outdoor stop gets a rain suggestion and the closed
  //                    museum a closure one
  // Expected output: suggestions for Harbour Park (rain) and Town Museum (closed)
  test('Rain and a closure, read from the real clients', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => Promise.resolve(fakeGoogleAndOpenWeather(input)));
    const { disruptionService, pushed } = await tripUnderWay({
      weatherClient: new OpenWeatherClient('test-weather-key'),
      placesClient: new GooglePlacesClient('test-places-key'),
    });

    await disruptionService.checkActiveTrips();

    expect(pushed.map((suggestion) => [suggestion.reason, suggestion.activityName]).sort()).toEqual([
      ['closed', 'Town Museum'],
      ['rain', 'Harbour Park'],
    ]);
    const forecastUrl = new URL(String(fetchSpy.mock.calls.find(([input]) => String(input).includes('openweathermap'))?.[0]));
    expect(forecastUrl.searchParams.get('appid')).toBe('test-weather-key');
  });

  // Mocked behavior: OpenWeather and Places answer with HTTP 500, then with bodies of an unexpected shape
  // Input: the timer runs on Saturday morning, once for each kind of failure
  // Expected status code: none (timer)
  // Expected behavior: each failure is logged as a warning and nothing is suggested
  // Expected output: no suggestions
  test.each([
    ['an HTTP error', () => jsonResponse({ error: 'down' }, 500)],
    ['an unexpected response', () => jsonResponse({ list: 'not-a-list', businessStatus: 'MAYBE' })],
  ])('The services answer with %s', async (_scenario, answer) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockImplementation(async () => Promise.resolve(answer()));
    const { disruptionService, pushed } = await tripUnderWay({
      weatherClient: new OpenWeatherClient('test-weather-key'),
      placesClient: new GooglePlacesClient('test-places-key'),
    });

    await disruptionService.checkActiveTrips();

    expect(pushed).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
