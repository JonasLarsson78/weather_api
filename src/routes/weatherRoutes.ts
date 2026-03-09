import { NextFunction, Request, Response, Router } from 'express';
import { mapWeatherData } from '../mappers/weatherMapper';
import { getWeatherSources } from '../services/weatherService';

const weatherRoutes = Router();

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

weatherRoutes.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Weather API is running' });
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
        weatherSources.openMeteo
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    res.status(500).json({ error: message });
  }
});

export default weatherRoutes;