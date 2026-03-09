export type SmhiPoint = [number, number];

export type SmhiParameter = {
  name: string;
  unit: string;
  values: number[];
};

export type SmhiTimeSeries = {
  validTime: string;
  parameters: SmhiParameter[];
};

export type SmhiWeatherResponse = {
  approvedTime?: string;
  referenceTime?: string;
  timeSeries?: SmhiTimeSeries[];
};

export type DmiTimeSerie = {
  localTimeIso?: string;
  temp?: number;
  symbol?: number;
  windSpeed?: number;
  humidity?: number;
  pressure?: number;
  precip1?: number;
};

export type DmiWeatherResponse = {
  id?: string;
  city?: string;
  country?: string;
  longitude?: number;
  latitude?: number;
  timezone?: string;
  lastupdate?: string;
  sunrise?: string;
  sunset?: string;
  timeserie?: DmiTimeSerie[];
};

export type WeatherCoordinates = {
  lat: number;
  lon: number;
};

export type WeatherSourcesResponse = {
  coordinates: WeatherCoordinates;
  smhi: SmhiWeatherResponse;
  dmi: DmiWeatherResponse | null;
  yr: YrWeatherResponse | null;
  openMeteo: OpenMeteoWeatherResponse | null;
};

export type YrTimeSeriesDetails = {
  air_temperature?: number;
  wind_speed?: number;
  relative_humidity?: number;
  air_pressure_at_sea_level?: number;
};

export type YrTimeSeries = {
  time: string;
  data?: {
    instant?: {
      details?: YrTimeSeriesDetails;
    };
    next_1_hours?: {
      summary?: {
        symbol_code?: string;
      };
    };
    next_6_hours?: {
      summary?: {
        symbol_code?: string;
      };
    };
  };
};

export type YrWeatherResponse = {
  properties?: {
    timeseries?: YrTimeSeries[];
  };
};

export type OpenMeteoHourly = {
  time?: string[];
  temperature_2m?: number[];
  relative_humidity_2m?: number[];
  wind_speed_10m?: number[];
  surface_pressure?: number[];
  weather_code?: number[];
};

export type OpenMeteoWeatherResponse = {
  hourly?: OpenMeteoHourly;
};