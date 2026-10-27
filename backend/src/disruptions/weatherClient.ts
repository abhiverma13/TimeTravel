import { z } from 'zod';

import type { GeoPoint } from '../itineraries/engine/types';

const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const WEATHER_TIMEOUT_MS = 10_000;
const SLOT_MS = 3 * 60 * 60 * 1000;
const MS_PER_SECOND = 1000;

/** One 3-hour slot of a forecast. */
export interface ForecastSlot {
  start: Date;
  end: Date;
  /** Probability of precipitation, 0 to 1. */
  precipitationChance: number;
  /** OpenWeather's main condition, such as "Rain" or "Clear". */
  condition: string;
}

export interface Forecast {
  /** The place's offset from UTC, so local stop times can be matched to slots. */
  utcOffsetSeconds: number;
  slots: ForecastSlot[];
}

/** External module boundary for the weather forecast, so tests can substitute it. */
export interface WeatherClient {
  forecast(point: GeoPoint): Promise<Forecast>;
}

export class WeatherApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherApiError';
  }
}

const forecastSchema = z.object({
  city: z.object({ timezone: z.number() }),
  list: z.array(
    z.object({
      dt: z.number(),
      pop: z.number().min(0).max(1).default(0),
      weather: z.array(z.object({ main: z.string() })).default([]),
    }),
  ),
});

/** OpenWeather's 5-day forecast in 3-hour steps: https://openweathermap.org/forecast5 */
export class OpenWeatherClient implements WeatherClient {
  constructor(private readonly apiKey: string) {}

  async forecast(point: GeoPoint): Promise<Forecast> {
    const url = new URL(FORECAST_URL);
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lng));
    url.searchParams.set('appid', this.apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!response.ok) {
      throw new WeatherApiError(`Forecast request failed with HTTP ${String(response.status)}`);
    }
    const parsed = forecastSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new WeatherApiError('Forecast request returned an unexpected response');
    }
    return {
      utcOffsetSeconds: parsed.data.city.timezone,
      slots: parsed.data.list.map((slot) => {
        const start = new Date(slot.dt * MS_PER_SECOND);
        return {
          start,
          end: new Date(start.getTime() + SLOT_MS),
          precipitationChance: slot.pop,
          condition: slot.weather.at(0)?.main ?? 'Unknown',
        };
      }),
    };
  }
}
