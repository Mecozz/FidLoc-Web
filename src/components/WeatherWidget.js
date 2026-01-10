import { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, Wind, AlertTriangle, Zap, Thermometer, X, RefreshCw, CloudLightning, Droplets } from 'lucide-react';
import './WeatherWidget.css';

const WEATHER_CODES = {
  0: { icon: Sun, label: 'Clear', color: '#fbbf24' },
  1: { icon: Sun, label: 'Mostly Clear', color: '#fbbf24' },
  2: { icon: Cloud, label: 'Partly Cloudy', color: '#94a3b8' },
  3: { icon: Cloud, label: 'Overcast', color: '#64748b' },
  45: { icon: Cloud, label: 'Foggy', color: '#94a3b8' },
  48: { icon: Cloud, label: 'Icy Fog', color: '#94a3b8' },
  51: { icon: CloudRain, label: 'Light Drizzle', color: '#60a5fa' },
  53: { icon: CloudRain, label: 'Drizzle', color: '#3b82f6' },
  55: { icon: CloudRain, label: 'Heavy Drizzle', color: '#2563eb' },
  61: { icon: CloudRain, label: 'Light Rain', color: '#60a5fa' },
  63: { icon: CloudRain, label: 'Rain', color: '#3b82f6' },
  65: { icon: CloudRain, label: 'Heavy Rain', color: '#2563eb' },
  66: { icon: CloudRain, label: 'Freezing Rain', color: '#06b6d4' },
  67: { icon: CloudRain, label: 'Heavy Freezing Rain', color: '#0891b2' },
  71: { icon: CloudSnow, label: 'Light Snow', color: '#e2e8f0' },
  73: { icon: CloudSnow, label: 'Snow', color: '#cbd5e1' },
  75: { icon: CloudSnow, label: 'Heavy Snow', color: '#94a3b8' },
  77: { icon: CloudSnow, label: 'Snow Grains', color: '#cbd5e1' },
  80: { icon: CloudRain, label: 'Light Showers', color: '#60a5fa' },
  81: { icon: CloudRain, label: 'Showers', color: '#3b82f6' },
  82: { icon: CloudRain, label: 'Heavy Showers', color: '#2563eb' },
  85: { icon: CloudSnow, label: 'Snow Showers', color: '#cbd5e1' },
  86: { icon: CloudSnow, label: 'Heavy Snow Showers', color: '#94a3b8' },
  95: { icon: CloudLightning, label: 'Thunderstorm', color: '#fbbf24' },
  96: { icon: CloudLightning, label: 'Thunderstorm + Hail', color: '#f59e0b' },
  99: { icon: CloudLightning, label: 'Severe Thunderstorm', color: '#ef4444' },
};

export default function WeatherWidget({ onClose }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchWeather = async (lat, lng) => {
    try {
      setLoading(true);
      setError(null);
      
      // Open-Meteo API - free, no key required
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&hourly=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=3`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      setWeather(data);
      setLoading(false);
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError('Failed to load weather');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          fetchWeather(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Default to Manchester, NH if location denied
          setLocation({ lat: 42.9956, lng: -71.4548 });
          fetchWeather(42.9956, -71.4548);
        }
      );
    } else {
      setLocation({ lat: 42.9956, lng: -71.4548 });
      fetchWeather(42.9956, -71.4548);
    }
  }, []);

  const handleRefresh = () => {
    if (location) {
      fetchWeather(location.lat, location.lng);
    }
  };

  const getWindWarning = (speed, gusts) => {
    if (gusts >= 40 || speed >= 30) {
      return { level: 'danger', message: '⚠️ DANGEROUS - Do not climb poles!' };
    } else if (gusts >= 25 || speed >= 20) {
      return { level: 'warning', message: '⚡ HIGH WINDS - Use extreme caution on poles' };
    } else if (gusts >= 15 || speed >= 12) {
      return { level: 'caution', message: '💨 Moderate winds - Be careful on ladders' };
    }
    return null;
  };

  const getLightningWarning = (weatherCode) => {
    if (weatherCode >= 95) {
      return { level: 'danger', message: '⚡ LIGHTNING ACTIVE - Seek shelter immediately!' };
    }
    return null;
  };

  const getWindDirection = (degrees) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };

  if (loading) {
    return (
      <div className="weather-widget">
        <div className="weather-header">
          <h3><Cloud size={18} /> Weather</h3>
          <button onClick={onClose} className="weather-close"><X size={18} /></button>
        </div>
        <div className="weather-loading">
          <RefreshCw size={24} className="spinning" />
          <span>Loading weather...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weather-widget">
        <div className="weather-header">
          <h3><Cloud size={18} /> Weather</h3>
          <button onClick={onClose} className="weather-close"><X size={18} /></button>
        </div>
        <div className="weather-error">
          <AlertTriangle size={24} />
          <span>{error}</span>
          <button onClick={handleRefresh}>Retry</button>
        </div>
      </div>
    );
  }

  const current = weather?.current;
  const hourly = weather?.hourly;
  const daily = weather?.daily;
  
  if (!current) return null;

  const weatherInfo = WEATHER_CODES[current.weather_code] || WEATHER_CODES[0];
  const WeatherIcon = weatherInfo.icon;
  const windWarning = getWindWarning(current.wind_speed_10m, current.wind_gusts_10m);
  const lightningWarning = getLightningWarning(current.weather_code);

  // Check for lightning in next few hours
  const hasUpcomingStorms = hourly?.weather_code?.slice(0, 6).some(code => code >= 95);

  return (
    <div className={`weather-widget ${expanded ? 'expanded' : ''}`}>
      <div className="weather-header">
        <h3><Cloud size={18} /> Weather</h3>
        <div className="weather-actions">
          <button onClick={handleRefresh} className="weather-refresh" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={onClose} className="weather-close"><X size={18} /></button>
        </div>
      </div>

      {/* Alerts Section */}
      {(lightningWarning || windWarning || hasUpcomingStorms) && (
        <div className="weather-alerts">
          {lightningWarning && (
            <div className={`weather-alert ${lightningWarning.level}`}>
              <Zap size={16} />
              <span>{lightningWarning.message}</span>
            </div>
          )}
          {windWarning && (
            <div className={`weather-alert ${windWarning.level}`}>
              <Wind size={16} />
              <span>{windWarning.message}</span>
            </div>
          )}
          {hasUpcomingStorms && !lightningWarning && (
            <div className="weather-alert warning">
              <CloudLightning size={16} />
              <span>⛈️ Thunderstorms expected in next 6 hours</span>
            </div>
          )}
        </div>
      )}

      {/* Current Conditions */}
      <div className="weather-current" onClick={() => setExpanded(!expanded)}>
        <div className="weather-main">
          <WeatherIcon size={48} color={weatherInfo.color} />
          <div className="weather-temp">
            <span className="temp-value">{Math.round(current.temperature_2m)}°F</span>
            <span className="temp-feels">Feels {Math.round(current.apparent_temperature)}°</span>
          </div>
        </div>
        <div className="weather-details">
          <span className="weather-condition">{weatherInfo.label}</span>
          <div className="weather-wind">
            <Wind size={14} />
            <span>{Math.round(current.wind_speed_10m)} mph {getWindDirection(current.wind_direction_10m)}</span>
            {current.wind_gusts_10m > current.wind_speed_10m + 5 && (
              <span className="wind-gusts">Gusts {Math.round(current.wind_gusts_10m)}</span>
            )}
          </div>
          <div className="weather-humidity">
            <Droplets size={14} />
            <span>{current.relative_humidity_2m}% humidity</span>
          </div>
        </div>
      </div>

      {/* Expanded Forecast */}
      {expanded && daily && (
        <div className="weather-forecast">
          <div className="forecast-title">3-Day Forecast</div>
          {daily.time.slice(0, 3).map((date, i) => {
            const dayInfo = WEATHER_CODES[daily.weather_code[i]] || WEATHER_CODES[0];
            const DayIcon = dayInfo.icon;
            const dayName = i === 0 ? 'Today' : new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
            return (
              <div key={date} className="forecast-day">
                <span className="forecast-day-name">{dayName}</span>
                <DayIcon size={20} color={dayInfo.color} />
                <span className="forecast-temps">
                  <span className="forecast-high">{Math.round(daily.temperature_2m_max[i])}°</span>
                  <span className="forecast-low">{Math.round(daily.temperature_2m_min[i])}°</span>
                </span>
                <span className="forecast-wind">
                  <Wind size={12} /> {Math.round(daily.wind_speed_10m_max[i])}
                  {daily.wind_gusts_10m_max[i] >= 25 && (
                    <span className="forecast-gust-warn">⚠️</span>
                  )}
                </span>
                {daily.precipitation_probability_max[i] > 30 && (
                  <span className="forecast-precip">{daily.precipitation_probability_max[i]}%</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="weather-footer" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Tap to collapse' : 'Tap for forecast'}
      </div>
    </div>
  );
}
