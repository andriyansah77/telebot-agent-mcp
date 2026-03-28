const axios = require('axios');

const WMO = {
  0:'☀️ Clear',1:'🌤️ Mainly clear',2:'⛅ Partly cloudy',3:'☁️ Overcast',
  45:'🌫️ Fog',48:'🌫️ Icy fog',51:'🌦️ Light drizzle',53:'🌦️ Drizzle',55:'🌧️ Heavy drizzle',
  61:'🌧️ Light rain',63:'🌧️ Rain',65:'🌧️ Heavy rain',71:'❄️ Light snow',73:'❄️ Snow',
  75:'❄️ Heavy snow',80:'🌦️ Showers',81:'🌧️ Heavy showers',82:'⛈️ Violent showers',
  95:'⛈️ Thunderstorm',96:'⛈️ Thunderstorm+hail',99:'⛈️ Severe thunderstorm'
};

async function geocode(city) {
  const { data } = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
    params: { name: city, count: 1, language: 'en', format: 'json' }
  });
  if (!data.results?.length) throw new Error(`City "${city}" not found`);
  return data.results[0];
}

async function run({ action, city, days = 3 }) {
  try {
    if (action === 'current') {
      if (!city) return 'Provide a city name';
      const loc = await geocode(city);
      const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: loc.latitude, longitude: loc.longitude,
          current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode,apparent_temperature,precipitation',
          wind_speed_unit: 'kmh', timezone: 'auto'
        }
      });
      const c = data.current;
      const desc = WMO[c.weathercode] || '🌡️ Unknown';
      return `📍 ${loc.name}, ${loc.country}\n${desc}\n🌡️ ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C)\n💧 Humidity: ${c.relative_humidity_2m}%\n💨 Wind: ${c.wind_speed_10m} km/h\n🌧️ Precip: ${c.precipitation}mm`;
    }

    if (action === 'forecast') {
      if (!city) return 'Provide a city name';
      const n = Math.min(parseInt(days) || 3, 7);
      const loc = await geocode(city);
      const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: loc.latitude, longitude: loc.longitude,
          daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
          timezone: 'auto', forecast_days: n
        }
      });
      const d = data.daily;
      const lines = d.time.map((date, i) => {
        const desc = WMO[d.weathercode[i]] || '—';
        return `📅 ${date}\n   ${desc}\n   🌡️ ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C  🌧️ ${d.precipitation_sum[i]}mm  💨 ${d.wind_speed_10m_max[i]}km/h`;
      });
      return `📍 ${n}-day forecast: ${loc.name}, ${loc.country}\n\n` + lines.join('\n\n');
    }

    return `Unknown action "${action}". Available: current, forecast`;
  } catch (err) {
    return `Weather error: ${err.message}`;
  }
}

module.exports = { run };
