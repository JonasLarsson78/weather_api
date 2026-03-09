import { NextFunction, Request, Response, Router } from 'express';
import { mapWeatherData } from '../mappers/weatherMapper';
import { sendReadmeMarkdown } from '../services/readmeMarkdown';
import { getWeatherSources } from '../services/weatherService';

const weatherRoutes = Router();

function parseForecastDays(daysValue: unknown) {
  if (typeof daysValue !== 'string' || daysValue.trim() === '') {
    return 7;
  }

  const parsed = Number(daysValue);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) {
    return null;
  }

  return parsed;
}

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const configuredApiKey = process.env.API_KEY;

  if (!configuredApiKey) {
    res.status(500).json({
      error: 'Server is missing API_KEY configuration'
    });
    return;
  }

  const headerApiKey = req.header('x-api-key');
  const queryApiKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined;
  const providedApiKey = headerApiKey || queryApiKey;

  if (!providedApiKey || providedApiKey !== configuredApiKey) {
    res.status(401).json({
      error: 'Unauthorized: invalid API key'
    });
    return;
  }

  next();
}

weatherRoutes.get('/health', (_req: Request, res: Response) => {
  res.json({ message: 'Weather API is running', status: 200 });
});

weatherRoutes.get('/', async (_req: Request, res: Response) => {
  await sendReadmeMarkdown(res);
});

weatherRoutes.get('/weather', requireApiKey, async (req: Request, res: Response) => {
  try {
    const city = String(req.query.city || '').trim();

    if (!city) {
      res.status(400).json({
        error: 'Missing query param: city',
        example: '/weather?city=Helsingborg'
      });
      return;
    }

    const weatherSources = await getWeatherSources(city);
    res.json(
      mapWeatherData(
        city,
        weatherSources.coordinates,
        weatherSources.smhi,
        weatherSources.dmi,
        weatherSources.yr,
        weatherSources.openMeteo,
        { forecastEntries: 12 }
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    res.status(500).json({ error: message });
  }
});

weatherRoutes.get('/weather/forecast', requireApiKey, async (req: Request, res: Response) => {
  try {
    const city = String(req.query.city || '').trim();

    if (!city) {
      res.status(400).json({
        error: 'Missing query param: city',
        example: '/weather/forecast?city=Helsingborg&days=7'
      });
      return;
    }

    const days = parseForecastDays(req.query.days);

    if (days === null) {
      res.status(400).json({
        error: 'Invalid query param: days must be an integer between 1 and 7',
        example: '/weather/forecast?city=Helsingborg&days=7'
      });
      return;
    }

    const weatherSources = await getWeatherSources(city, days);
    const mappedWeather = mapWeatherData(
      city,
      weatherSources.coordinates,
      weatherSources.smhi,
      weatherSources.dmi,
      weatherSources.yr,
      weatherSources.openMeteo,
      { forecastRangeHours: days * 24 }
    );

    // Calculate next day's 01:00 in local time
    const now = new Date();
    const nextOneAM = new Date(now);
    nextOneAM.setHours(1, 0, 0, 0); // today 01:00
    if (now.getHours() >= 1) {
      nextOneAM.setDate(nextOneAM.getDate() + 1); // move to next day if already past 01:00
    }

    // End is 7 days after next 01:00
    const endOneAM = new Date(nextOneAM);
    endOneAM.setDate(endOneAM.getDate() + 7);

    // Only include forecast entries within [nextOneAM, endOneAM)
    const forecastWithoutSources = mappedWeather.forecast
      .map((entry) => {
        const { sources: _sources, sourceCount: _sourceCount, ...rest } = entry;
        return rest;
      })
      .filter((entry) => {
        if (typeof entry.validTime !== 'string') return false;
        const t = Date.parse(entry.validTime);
        return (
          Number.isFinite(t) &&
          t >= nextOneAM.getTime() &&
          t < endOneAM.getTime()
        );
      });

    res.json({
      city: mappedWeather.city,
      coordinates: mappedWeather.coordinates,
      approvedTime: mappedWeather.approvedTime,
      referenceTime: mappedWeather.referenceTime,
      days,
      forecast: forecastWithoutSources
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    res.status(500).json({ error: message });
  }
});

export default weatherRoutes;