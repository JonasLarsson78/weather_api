import { formatDateTime } from '../utils/dateTime';
import {
  DmiTimeSerie,
  DmiWeatherResponse,
  OpenMeteoWeatherResponse,
  SmhiParameter,
  SmhiWeatherResponse,
  WeatherCoordinates,
  YrTimeSeries,
  YrWeatherResponse
} from '../types/weather';

function pickParameter(parameters: SmhiParameter[], name: string) {
  const parameter = parameters.find((item) => item.name === name);

  if (!parameter || !Array.isArray(parameter.values) || parameter.values.length === 0) {
    return null;
  }

  return {
    value: parameter.values[0],
    unit: parameter.unit
  };
}

function averageValues(values: Array<number | null | undefined>) {
  const validValues = values.filter((value): value is number => typeof value === 'number');

  if (validValues.length === 0) {
    return null;
  }

  const sum = validValues.reduce((accumulator, value) => accumulator + value, 0);
  return sum / validValues.length;
}

function roundHalfUp(value: number | null) {
  if (value === null) {
    return null;
  }

  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

function getSmhiCurrentValue(weather: SmhiWeatherResponse, parameterName: string) {
  const firstEntry = weather.timeSeries?.[0];
  if (!firstEntry) {
    return null;
  }

  return pickParameter(firstEntry.parameters || [], parameterName)?.value ?? null;
}

function getDmiCurrent(dmi: DmiWeatherResponse | null): DmiTimeSerie | null {
  if (!dmi || !Array.isArray(dmi.timeserie) || dmi.timeserie.length === 0) {
    return null;
  }

  return dmi.timeserie[0] ?? null;
}

function toTimeKey(value?: string) {
  if (!value) {
    return null;
  }

  const normalizedValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00Z`
    : value;

  const timestamp = Date.parse(normalizedValue);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

function countSources(values: Array<number | null | undefined>) {
  return values.filter((value) => typeof value === 'number').length;
}

function normalizePressure(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return null;
  }

  if (value < 800 || value > 1100) {
    return null;
  }

  return value;
}

function getYrCurrent(yr: YrWeatherResponse | null): YrTimeSeries | null {
  const series = yr?.properties?.timeseries;

  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }

  return series[0] ?? null;
}

function getOpenMeteoValueAt(
  openMeteo: OpenMeteoWeatherResponse | null,
  timeKey: number,
  field: keyof NonNullable<OpenMeteoWeatherResponse['hourly']>
) {
  const hourly = openMeteo?.hourly;
  if (!hourly?.time || !Array.isArray(hourly.time)) {
    return null;
  }

  const index = hourly.time.findIndex((time) => toTimeKey(time) === timeKey);
  if (index < 0) {
    return null;
  }

  const values = hourly[field];
  if (!Array.isArray(values) || typeof values[index] !== 'number') {
    return null;
  }

  return values[index] as number;
}

function replaceNullWithZero<T>(value: T): T {
  if (value === null) {
    return 0 as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceNullWithZero(item)) as T;
  }

  if (typeof value === 'object' && value !== undefined) {
    const updatedEntries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      replaceNullWithZero(item)
    ]);

    return Object.fromEntries(updatedEntries) as T;
  }

  return value;
}

function withUnit(value: number | null | undefined, unit: string) {
  return {
    value: value ?? null,
    unit
  };
}

function parseDmiSunTime(value?: string) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  const padded = digits.padStart(4, '0').slice(-4);
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function getDmiSunMinutes(dmi: DmiWeatherResponse | null) {
  if (!dmi) {
    return null;
  }

  const sunriseMinutes = parseDmiSunTime(dmi.sunrise);
  const sunsetMinutes = parseDmiSunTime(dmi.sunset);

  if (sunriseMinutes === null || sunsetMinutes === null) {
    return null;
  }

  return {
    sunriseMinutes,
    sunsetMinutes
  };
}

function isNightInStockholm(
  value?: string,
  dmiSunMinutes?: { sunriseMinutes: number; sunsetMinutes: number } | null
) {
  const timeKey = toTimeKey(value);
  if (timeKey === null) {
    return false;
  }

  const date = new Date(timeKey);
  const hour = Number(
    new Intl.DateTimeFormat('sv-SE', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Europe/Stockholm'
    }).format(date)
  );

  const minute = Number(
    new Intl.DateTimeFormat('sv-SE', {
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Stockholm'
    }).format(date)
  );

  const localMinutes = hour * 60 + minute;

  if (dmiSunMinutes) {
    return localMinutes < dmiSunMinutes.sunriseMinutes || localMinutes >= dmiSunMinutes.sunsetMinutes;
  }

  return hour >= 21 || hour < 6;
}

function toIconFromYr(symbolCode?: string) {
  if (!symbolCode) {
    return null;
  }

  const normalized = symbolCode.toLowerCase();
  const isNight = normalized.includes('night') || normalized.includes('polartwilight');

  if (normalized.includes('thunder')) return 'wi wi-thunderstorm';
  if (normalized.includes('sleet')) return 'wi wi-sleet';
  if (normalized.includes('snow')) return 'wi wi-snow';
  if (normalized.includes('rain') || normalized.includes('drizzle')) return 'wi wi-rain';
  if (normalized.includes('fog')) return 'wi wi-fog';
  if (normalized.includes('partlycloudy')) return isNight ? 'wi wi-night-cloudy' : 'wi wi-day-cloudy';
  if (normalized.includes('cloudy')) return 'wi wi-cloudy';
  if (normalized.includes('fair')) {
    return isNight ? 'wi wi-night-cloudy' : 'wi wi-day-sunny-overcast';
  }
  if (normalized.includes('clearsky')) {
    return isNight ? 'wi wi-night-clear' : 'wi wi-day-sunny';
  }

  return 'wi wi-na';
}

function toIconFromSmhi(symbol?: number | null, isNight = false) {
  if (typeof symbol !== 'number') {
    return null;
  }

  const iconMap: Record<number, string> = {
    1: 'wi wi-day-sunny',
    2: 'wi wi-day-sunny-overcast',
    3: 'wi wi-day-cloudy',
    4: 'wi wi-cloudy',
    5: 'wi wi-rain',
    6: 'wi wi-rain',
    7: 'wi wi-sleet',
    8: 'wi wi-snow',
    9: 'wi wi-rain-mix',
    10: 'wi wi-rain-mix',
    11: 'wi wi-thunderstorm',
    12: 'wi wi-fog',
    13: 'wi wi-fog',
    14: 'wi wi-rain',
    15: 'wi wi-sleet',
    16: 'wi wi-snow',
    17: 'wi wi-rain-mix',
    18: 'wi wi-sleet',
    19: 'wi wi-snow',
    20: 'wi wi-rain',
    21: 'wi wi-sleet',
    22: 'wi wi-snow',
    23: 'wi wi-thunderstorm',
    24: 'wi wi-thunderstorm',
    25: 'wi wi-sleet',
    26: 'wi wi-snow',
    27: 'wi wi-rain'
  };

  const icon = iconMap[symbol] ?? 'wi wi-na';

  if (!isNight) {
    return icon;
  }

  if (icon === 'wi wi-day-sunny') return 'wi wi-night-clear';
  if (icon === 'wi wi-day-sunny-overcast') return 'wi wi-night-cloudy';
  if (icon === 'wi wi-day-cloudy') return 'wi wi-night-cloudy';

  return icon;
}

function toIconFromOpenMeteo(code?: number | null, isNight = false) {
  if (typeof code !== 'number') {
    return null;
  }

  if (code === 0) return isNight ? 'wi wi-night-clear' : 'wi wi-day-sunny';
  if ([1, 2].includes(code)) return isNight ? 'wi wi-night-cloudy' : 'wi wi-day-cloudy';
  if (code === 3) return 'wi wi-cloudy';
  if ([45, 48].includes(code)) return 'wi wi-fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'wi wi-sprinkle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'wi wi-rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'wi wi-snow';
  if ([95, 96, 99].includes(code)) return 'wi wi-thunderstorm';
  return 'wi wi-na';
}

function getIconColor(icon?: string | null) {
  if (!icon || icon === 'wi wi-na') return '#9ca3af';
  if (icon.includes('night')) return '#60a5fa';
  if (icon.includes('day-sunny')) return '#facc15';
  if (icon.includes('thunderstorm')) return '#a78bfa';
  if (icon.includes('snow') || icon.includes('sleet')) return '#67e8f9';
  if (icon.includes('rain') || icon.includes('sprinkle')) return '#38bdf8';
  if (icon.includes('fog') || icon.includes('cloudy')) return '#94a3b8';
  return '#e2e8f0';
}

function withIcon(icon?: string | null) {
  const value = !icon || icon === 'wi wi-na' ? 'wi wi-na' : icon;

  return {
    value,
    color: getIconColor(value)
  };
}

function pickMergedIcon(
  candidates: Array<{ source: string; icon: string | null }>,
  fallbackIcon = 'wi wi-na'
) {
  const first = candidates.find(
    (item) => typeof item.icon === 'string' && item.icon.length > 0 && item.icon !== 'wi wi-na'
  );

  return withIcon(first?.icon ?? fallbackIcon);
}

export function mapWeatherData(
  city: string,
  coordinates: WeatherCoordinates,
  smhi: SmhiWeatherResponse,
  dmi: DmiWeatherResponse | null,
  yr: YrWeatherResponse | null,
  openMeteo: OpenMeteoWeatherResponse | null,
  options?: {
    forecastEntries?: number;
    forecastRangeHours?: number;
  }
) {
  const forecastEntries = Math.max(1, options?.forecastEntries ?? 12);
  const forecastRangeHours = options?.forecastRangeHours;
  const series = Array.isArray(smhi.timeSeries) ? smhi.timeSeries : [];
  const dmiSunMinutes = getDmiSunMinutes(dmi);
  const dmiSeries = Array.isArray(dmi?.timeserie) ? dmi.timeserie : [];
  const yrSeries = Array.isArray(yr?.properties?.timeseries) ? yr.properties.timeseries : [];
  const dmiByTime = new Map<number, DmiTimeSerie>();
  const yrByTime = new Map<number, YrTimeSeries>();

  for (const entry of dmiSeries) {
    const timeKey = toTimeKey(entry.localTimeIso);
    if (timeKey !== null) {
      dmiByTime.set(timeKey, entry);
    }
  }

  for (const entry of yrSeries) {
    const timeKey = toTimeKey(entry.time);
    if (timeKey !== null) {
      yrByTime.set(timeKey, entry);
    }
  }

  let limitedSeries: typeof series;

  if (typeof forecastRangeHours === 'number' && forecastRangeHours > 0 && series.length > 0) {
    const firstEntryTimestamp = Date.parse(series[0].validTime);

    if (Number.isFinite(firstEntryTimestamp)) {
      const maxTimestamp = firstEntryTimestamp + forecastRangeHours * 60 * 60 * 1000;
      limitedSeries = series.filter((entry) => {
        const entryTimestamp = Date.parse(entry.validTime);
        return Number.isFinite(entryTimestamp) && entryTimestamp <= maxTimestamp;
      });
    } else {
      limitedSeries = series.slice(0, forecastEntries);
    }
  } else {
    limitedSeries = series.slice(0, forecastEntries);
  }

  const mappedSeries = limitedSeries.map((entry) => {
    const params = entry.parameters || [];

    return {
      validTime: formatDateTime(entry.validTime),
      temperature: pickParameter(params, 't'),
      windSpeed: pickParameter(params, 'ws'),
      windDirection: pickParameter(params, 'wd'),
      humidity: pickParameter(params, 'r'),
      pressure: pickParameter(params, 'pmean'),
      precipitationMin: pickParameter(params, 'pmin'),
      precipitationMax: pickParameter(params, 'pmax'),
      cloudCover: pickParameter(params, 'tcc_mean')
    };
  });

  const averageForecast = limitedSeries.map((entry) => {
    const params = entry.parameters || [];
    const entryTimeKey = toTimeKey(entry.validTime);
    const entryIsNight = isNightInStockholm(entry.validTime, dmiSunMinutes);
    const smhiSymbol = pickParameter(params, 'Wsymb2')?.value ?? null;
    const smhiTemp = pickParameter(params, 't')?.value ?? null;
    const smhiWind = pickParameter(params, 'ws')?.value ?? null;
    const smhiHumidity = pickParameter(params, 'r')?.value ?? null;
    const smhiPressure = normalizePressure(pickParameter(params, 'pmean')?.value ?? null);

    const dmiEntry = dmiByTime.get(entryTimeKey ?? -1);
    const dmiTemp = dmiEntry?.temp ?? null;
    const dmiWind = dmiEntry?.windSpeed ?? null;
    const dmiHumidity = dmiEntry?.humidity ?? null;
    const dmiPressure = normalizePressure(dmiEntry?.pressure ?? null);
    const dmiIcon = toIconFromSmhi(dmiEntry?.symbol ?? null, entryIsNight);
    const yrEntry = yrByTime.get(entryTimeKey ?? -1);
    const yrDetails = yrEntry?.data?.instant?.details;
    const yrSymbolCode =
      yrEntry?.data?.next_1_hours?.summary?.symbol_code ||
      yrEntry?.data?.next_6_hours?.summary?.symbol_code;
    const yrTemp = yrDetails?.air_temperature ?? null;
    const yrWind = yrDetails?.wind_speed ?? null;
    const yrHumidity = yrDetails?.relative_humidity ?? null;
    const yrPressure = normalizePressure(yrDetails?.air_pressure_at_sea_level ?? null);
    const openMeteoTemp =
      entryTimeKey === null ? null : getOpenMeteoValueAt(openMeteo, entryTimeKey, 'temperature_2m');
    const openMeteoWind =
      entryTimeKey === null ? null : getOpenMeteoValueAt(openMeteo, entryTimeKey, 'wind_speed_10m');
    const openMeteoHumidity =
      entryTimeKey === null
        ? null
        : getOpenMeteoValueAt(openMeteo, entryTimeKey, 'relative_humidity_2m');
    const openMeteoPressure =
      entryTimeKey === null
        ? null
        : normalizePressure(getOpenMeteoValueAt(openMeteo, entryTimeKey, 'surface_pressure'));
    const openMeteoWeatherCode =
      entryTimeKey === null ? null : getOpenMeteoValueAt(openMeteo, entryTimeKey, 'weather_code');
    const smhiIcon = toIconFromSmhi(smhiSymbol, entryIsNight);
    const yrIcon = toIconFromYr(yrSymbolCode);
    const openMeteoIcon = toIconFromOpenMeteo(openMeteoWeatherCode, entryIsNight);
    const mergedIcon = pickMergedIcon([
      { source: 'dmi', icon: dmiIcon },
      { source: 'smhi', icon: smhiIcon },
      { source: 'yr', icon: yrIcon },
      { source: 'openMeteo', icon: openMeteoIcon },
    ], entryIsNight ? 'wi wi-night-clear' : 'wi wi-day-sunny');

    return {
      validTime: formatDateTime(entry.validTime),
      icon: mergedIcon,
      temperature: withUnit(
        roundHalfUp(averageValues([smhiTemp, dmiTemp, yrTemp, openMeteoTemp])),
        '°C'
      ),
      windSpeed: withUnit(
        roundHalfUp(averageValues([smhiWind, dmiWind, yrWind, openMeteoWind])),
        'm/s'
      ),
      humidity: withUnit(
        roundHalfUp(averageValues([smhiHumidity, dmiHumidity, yrHumidity, openMeteoHumidity])),
        '%'
      ),
      pressure: withUnit(
        roundHalfUp(averageValues([smhiPressure, dmiPressure, yrPressure, openMeteoPressure])),
        'hPa'
      ),
      sourceCount: countSources([smhiTemp, dmiTemp, yrTemp, openMeteoTemp]),
      sources: {
        smhi: {
          icon: withIcon(smhiIcon),
          temperature: withUnit(smhiTemp, '°C'),
          windSpeed: withUnit(smhiWind, 'm/s'),
          humidity: withUnit(smhiHumidity, '%'),
          pressure: withUnit(smhiPressure, 'hPa')
        },
        dmi: {
          icon: withIcon(dmiIcon),
          temperature: withUnit(dmiTemp, '°C'),
          windSpeed: withUnit(dmiWind, 'm/s'),
          humidity: withUnit(dmiHumidity, '%'),
          pressure: withUnit(dmiPressure, 'hPa')
        },
        yr: {
          icon: withIcon(yrIcon),
          temperature: withUnit(yrTemp, '°C'),
          windSpeed: withUnit(yrWind, 'm/s'),
          humidity: withUnit(yrHumidity, '%'),
          pressure: withUnit(yrPressure, 'hPa')
        },
        openMeteo: {
          icon: withIcon(openMeteoIcon),
          temperature: withUnit(openMeteoTemp, '°C'),
          windSpeed: withUnit(openMeteoWind, 'm/s'),
          humidity: withUnit(openMeteoHumidity, '%'),
          pressure: withUnit(openMeteoPressure, 'hPa')
        }
      }
    };
  });

  const dmiCurrent = getDmiCurrent(dmi);
  const yrCurrent = getYrCurrent(yr);
  const yrCurrentDetails = yrCurrent?.data?.instant?.details;
  const yrCurrentIcon = toIconFromYr(
    yrCurrent?.data?.next_1_hours?.summary?.symbol_code ||
      yrCurrent?.data?.next_6_hours?.summary?.symbol_code
  );
  const firstSmhiTimeKey = toTimeKey(smhi.timeSeries?.[0]?.validTime);
  const currentIsNight = isNightInStockholm(smhi.timeSeries?.[0]?.validTime, dmiSunMinutes);
  const smhiCurrentSymbol = pickParameter(smhi.timeSeries?.[0]?.parameters || [], 'Wsymb2')?.value ?? null;
  const smhiCurrentIcon = toIconFromSmhi(smhiCurrentSymbol, currentIsNight);
  const dmiCurrentIcon = toIconFromSmhi(dmiCurrent?.symbol ?? null, currentIsNight);
  const openMeteoCurrentTemp =
    firstSmhiTimeKey === null
      ? null
      : getOpenMeteoValueAt(openMeteo, firstSmhiTimeKey, 'temperature_2m');
  const openMeteoCurrentWind =
    firstSmhiTimeKey === null
      ? null
      : getOpenMeteoValueAt(openMeteo, firstSmhiTimeKey, 'wind_speed_10m');
  const openMeteoCurrentHumidity =
    firstSmhiTimeKey === null
      ? null
      : getOpenMeteoValueAt(openMeteo, firstSmhiTimeKey, 'relative_humidity_2m');
  const openMeteoCurrentPressure =
    firstSmhiTimeKey === null
      ? null
      : normalizePressure(getOpenMeteoValueAt(openMeteo, firstSmhiTimeKey, 'surface_pressure'));
  const openMeteoCurrentWeatherCode =
    firstSmhiTimeKey === null
      ? null
      : getOpenMeteoValueAt(openMeteo, firstSmhiTimeKey, 'weather_code');
  const openMeteoCurrentIcon = toIconFromOpenMeteo(openMeteoCurrentWeatherCode, currentIsNight);

  const temperatureAvg = averageValues([
    getSmhiCurrentValue(smhi, 't'),
    dmiCurrent?.temp,
    yrCurrentDetails?.air_temperature,
    openMeteoCurrentTemp
  ]);
  const windSpeedAvg = averageValues([
    getSmhiCurrentValue(smhi, 'ws'),
    dmiCurrent?.windSpeed,
    yrCurrentDetails?.wind_speed,
    openMeteoCurrentWind
  ]);
  const humidityAvg = averageValues([
    getSmhiCurrentValue(smhi, 'r'),
    dmiCurrent?.humidity,
    yrCurrentDetails?.relative_humidity,
    openMeteoCurrentHumidity
  ]);
  const pressureAvg = averageValues([
    normalizePressure(getSmhiCurrentValue(smhi, 'pmean')),
    normalizePressure(dmiCurrent?.pressure),
    normalizePressure(yrCurrentDetails?.air_pressure_at_sea_level),
    openMeteoCurrentPressure
  ]);
  const smhiCurrent = mappedSeries[0] ?? null;
  const mergedCurrent = {
    validTime:
      smhiCurrent?.validTime ??
      formatDateTime(dmiCurrent?.localTimeIso) ??
      formatDateTime(yrCurrent?.time),
    icon: pickMergedIcon([
      { source: 'dmi', icon: dmiCurrentIcon },
      { source: 'smhi', icon: smhiCurrentIcon },
      { source: 'yr', icon: yrCurrentIcon },
      { source: 'openMeteo', icon: openMeteoCurrentIcon },
    ], currentIsNight ? 'wi wi-night-clear' : 'wi wi-day-sunny'),
    average: {
      temperature: withUnit(roundHalfUp(temperatureAvg), '°C'),
      windSpeed: withUnit(roundHalfUp(windSpeedAvg), 'm/s'),
      humidity: withUnit(roundHalfUp(humidityAvg), '%'),
      pressure: withUnit(roundHalfUp(pressureAvg), 'hPa')
    },
    sourceCount: countSources([
      smhiCurrent?.temperature?.value,
      dmiCurrent?.temp,
      yrCurrentDetails?.air_temperature,
      openMeteoCurrentTemp
    ]),
    sources: {
      smhi: smhiCurrent
        ? {
            icon: withIcon(smhiCurrentIcon),
            temperature: withUnit(smhiCurrent.temperature?.value ?? null, '°C'),
            windSpeed: withUnit(smhiCurrent.windSpeed?.value ?? null, 'm/s'),
            humidity: withUnit(smhiCurrent.humidity?.value ?? null, '%'),
            pressure: withUnit(normalizePressure(smhiCurrent.pressure?.value ?? null), 'hPa')
          }
        : null,
      dmi: dmiCurrent
        ? {
            icon: withIcon(dmiCurrentIcon),
            temperature: withUnit(dmiCurrent.temp ?? null, '°C'),
            windSpeed: withUnit(dmiCurrent.windSpeed ?? null, 'm/s'),
            humidity: withUnit(dmiCurrent.humidity ?? null, '%'),
            pressure: withUnit(normalizePressure(dmiCurrent.pressure ?? null), 'hPa')
          }
        : null,
      yr: yrCurrentDetails
        ? {
            icon: withIcon(yrCurrentIcon),
            temperature: withUnit(yrCurrentDetails.air_temperature ?? null, '°C'),
            windSpeed: withUnit(yrCurrentDetails.wind_speed ?? null, 'm/s'),
            humidity: withUnit(yrCurrentDetails.relative_humidity ?? null, '%'),
            pressure: withUnit(
              normalizePressure(yrCurrentDetails.air_pressure_at_sea_level ?? null),
              'hPa'
            )
          }
        : null,
      openMeteo: {
        icon: withIcon(openMeteoCurrentIcon),
        temperature: withUnit(openMeteoCurrentTemp, '°C'),
        windSpeed: withUnit(openMeteoCurrentWind, 'm/s'),
        humidity: withUnit(openMeteoCurrentHumidity, '%'),
        pressure: withUnit(openMeteoCurrentPressure, 'hPa')
      }
    }
  };

  return replaceNullWithZero({
    city,
    coordinates,
    approvedTime: formatDateTime(smhi.approvedTime),
    referenceTime: formatDateTime(smhi.referenceTime),
    current: mergedCurrent,
    forecast: averageForecast
  });
}