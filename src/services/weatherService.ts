import {
  DmiWeatherResponse,
  OpenMeteoWeatherResponse,
  SmhiPoint,
  SmhiWeatherResponse,
  WeatherCoordinates,
  WeatherSourcesResponse,
  YrWeatherResponse
} from '../types/weather';

let smhiPointsCache: Promise<SmhiPoint[]> | null = null;

async function getSmhiPoints() {
  if (!smhiPointsCache) {
    smhiPointsCache = fetch(
      'https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/multipoint.json'
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not fetch SMHI multipoint grid');
        }

        const data = (await response.json()) as {
          coordinates?: SmhiPoint[];
        };

        if (!Array.isArray(data.coordinates) || data.coordinates.length === 0) {
          throw new Error('SMHI multipoint grid is empty');
        }

        return data.coordinates;
      })
      .catch((error) => {
        smhiPointsCache = null;
        throw error;
      });
  }

  return smhiPointsCache;
}

function findNearestSmhiPoint(lon: number, lat: number, points: SmhiPoint[]) {
  let nearest = points[0];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const [pointLon, pointLat] of points) {
    const deltaLon = pointLon - lon;
    const deltaLat = pointLat - lat;
    const distance = deltaLon * deltaLon + deltaLat * deltaLat;

    if (distance < smallestDistance) {
      smallestDistance = distance;
      nearest = [pointLon, pointLat];
    }
  }

  return nearest;
}

export async function getWeather(city: string): Promise<SmhiWeatherResponse> {
  const coordinates = await getCoordinatesForCity(city);
  return getSmhiWeatherByCoordinates(coordinates);
}

async function getCoordinatesForCity(city: string): Promise<WeatherCoordinates> {
  const geoUrl = new URL('https://nominatim.openstreetmap.org/search');
  geoUrl.searchParams.set('city', city);
  geoUrl.searchParams.set('country', 'sweden');
  geoUrl.searchParams.set('format', 'json');

  const geoResponse = await fetch(geoUrl, {
    headers: {
      'User-Agent': 'weather_api/1.0 (local development)'
    }
  });

  if (!geoResponse.ok) {
    throw new Error('Could not fetch coordinates');
  }

  const geo = (await geoResponse.json()) as Array<{ lat: string; lon: string }>;

  if (!geo.length) {
    throw new Error(`City not found: ${city}`);
  }

  const lat = Number(geo[0].lat);
  const lon = Number(geo[0].lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Invalid coordinates for city: ${city}`);
  }

  return { lat, lon };
}

async function getSmhiWeatherByCoordinates(
  coordinates: WeatherCoordinates
): Promise<SmhiWeatherResponse> {
  const { lat, lon } = coordinates;
  const smhiPoints = await getSmhiPoints();
  const [nearestLon, nearestLat] = findNearestSmhiPoint(lon, lat, smhiPoints);

  const weatherResponse = await fetch(
    `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${nearestLon}/lat/${nearestLat}/data.json`
  );

  if (!weatherResponse.ok) {
    const bodyText = await weatherResponse.text();
    throw new Error(
      `Could not fetch weather from SMHI (${weatherResponse.status}): ${bodyText.slice(0, 120)}`
    );
  }

  return (await weatherResponse.json()) as SmhiWeatherResponse;
}

async function getDmiWeatherByCoordinates(
  coordinates: WeatherCoordinates
): Promise<DmiWeatherResponse | null> {
  const dmiUrl = new URL('https://www.dmi.dk/NinJo2DmiDk/ninjo2dmidk');
  dmiUrl.searchParams.set('cmd', 'llj');
  dmiUrl.searchParams.set('lat', String(coordinates.lat));
  dmiUrl.searchParams.set('lon', String(coordinates.lon));

  const response = await fetch(dmiUrl);

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as DmiWeatherResponse;

  if (!Array.isArray(data.timeserie) || data.timeserie.length === 0) {
    return null;
  }

  return data;
}

async function getYrWeatherByCoordinates(
  coordinates: WeatherCoordinates
): Promise<YrWeatherResponse | null> {
  const yrUrl = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact');
  yrUrl.searchParams.set('lat', String(coordinates.lat));
  yrUrl.searchParams.set('lon', String(coordinates.lon));

  const response = await fetch(yrUrl, {
    headers: {
      'User-Agent': 'weather_api/1.0 github-copilot'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as YrWeatherResponse;
  const series = data.properties?.timeseries;

  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }

  return data;
}

async function getOpenMeteoWeatherByCoordinates(
  coordinates: WeatherCoordinates,
  forecastDays = 3
): Promise<OpenMeteoWeatherResponse | null> {
  const openMeteoUrl = new URL('https://api.open-meteo.com/v1/forecast');
  openMeteoUrl.searchParams.set('latitude', String(coordinates.lat));
  openMeteoUrl.searchParams.set('longitude', String(coordinates.lon));
  openMeteoUrl.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code'
  );
  openMeteoUrl.searchParams.set('forecast_days', String(forecastDays));
  openMeteoUrl.searchParams.set('timezone', 'UTC');

  const response = await fetch(openMeteoUrl);

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as OpenMeteoWeatherResponse;
  const hourlyTimes = data.hourly?.time;

  if (!Array.isArray(hourlyTimes) || hourlyTimes.length === 0) {
    return null;
  }

  return data;
}

export async function getWeatherSources(
  city: string,
  forecastDays = 3
): Promise<WeatherSourcesResponse> {
  const coordinates = await getCoordinatesForCity(city);
  const normalizedForecastDays = Math.min(7, Math.max(1, Math.floor(forecastDays)));

  const [smhi, dmi, yr, openMeteo] = await Promise.all([
    getSmhiWeatherByCoordinates(coordinates),
    getDmiWeatherByCoordinates(coordinates),
    getYrWeatherByCoordinates(coordinates),
    getOpenMeteoWeatherByCoordinates(coordinates, normalizedForecastDays)
  ]);

  return {
    coordinates,
    smhi,
    dmi,
    yr,
    openMeteo
  };
}