# Weather API

En Node.js + TypeScript + Express API som hämtar väder från flera källor och slår ihop datan.

## GitHub

Repository: https://github.com/JonasLarsson78/weather_api

## Datakällor

- SMHI
- DMI
- Yr (MET Norway)
- Open-Meteo

## Funktioner

- Slår ihop flera väderkällor till ett gemensamt svar
- Räknar medelvärden för temperatur, vind, luftfuktighet och tryck
- Avrundar medelvärden till heltal (4 ner, 5 upp)
- Returnerar ikoner med färginformation
- Byter dag/natt-ikoner baserat på soluppgång/solnedgång (DMI när tillgängligt)
- Skyddar endpoint med API-nyckel

## Krav

- Node.js 18+ (rekommenderat 20+)
- npm

## Installation

```bash
npm install
```

## Miljövariabler

Skapa en `.env`-fil (eller kopiera från `.env.example`):

```env
API_KEY=din-hemliga-nyckel
PORT=3001
```

## Köra lokalt

Utvecklingsläge:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Starta byggd version:

```bash
npm start
```

## API

### Health

`GET /`

Svar:

```json
{ "message": "Weather API is running" }
```

### Weather

`GET /weather?city=Helsingborg`

Autentisering:

- Rekommenderat via header: `x-api-key: <API_KEY>`
- Alternativt via query: `apiKey=<API_KEY>`

Exempel med curl:

```bash
curl -H "x-api-key: DIN_API_KEY" "http://localhost:3001/weather?city=Helsingborg"
```

### Forecast (upp till 7 dagar)

`GET /weather/forecast?city=Helsingborg&days=7`

Autentisering:

- Rekommenderat via header: `x-api-key: <API_KEY>`
- Alternativt via query: `apiKey=<API_KEY>`

Regler:

- `city` krävs
- `days` är valfri, default `7`
- `days` måste vara ett heltal mellan `1` och `7`

Exempel med curl:

```bash
curl -H "x-api-key: DIN_API_KEY" "http://localhost:3001/weather/forecast?city=Helsingborg&days=7"
```

Exempel på svar (förenklat):

```json
{
  "city": "Helsingborg",
  "coordinates": { "lat": 56.04, "lon": 12.70 },
  "approvedTime": "2026-03-09 10:31:32",
  "referenceTime": "2026-03-09 10:00:00",
  "days": 7,
  "forecast": [
    {
      "validTime": "2026-03-10 01:00:00",
      "icon": { "value": "wi wi-day-cloudy", "color": "#94a3b8" },
      "temperature": { "value": 10, "unit": "°C" },
      "windSpeed": { "value": 4, "unit": "m/s" },
      "humidity": { "value": 67, "unit": "%" },
      "pressure": { "value": 1023, "unit": "hPa" }
    }
  ]
}
```

## Svarsformat (förenklat)

```json
{
  "city": "Helsingborg",
  "coordinates": { "lat": 56.04, "lon": 12.70 },
  "approvedTime": "2026-03-09 10:31:32",
  "referenceTime": "2026-03-09 10:00:00",
  "current": {
    "validTime": "2026-03-09 11:00:00",
    "icon": { "value": "wi wi-day-sunny", "color": "#facc15" },
    "average": {
      "temperature": { "value": 9, "unit": "°C" },
      "windSpeed": { "value": 3, "unit": "m/s" },
      "humidity": { "value": 69, "unit": "%" },
      "pressure": { "value": 1024, "unit": "hPa" }
    }
  },
  "forecast": [
    {
      "validTime": "2026-03-09 12:00:00",
      "icon": { "value": "wi wi-day-cloudy", "color": "#94a3b8" },
      "temperature": { "value": 10, "unit": "°C" },
      "windSpeed": { "value": 4, "unit": "m/s" },
      "humidity": { "value": 67, "unit": "%" },
      "pressure": { "value": 1023, "unit": "hPa" }
    }
  ]
}
```

## Noteringar

- Om en källa saknar data ersätts `null` med `0` i svaret.
- Ikoner returneras som `weather-icons` klasser (`wi ...`) samt färg i hex.
