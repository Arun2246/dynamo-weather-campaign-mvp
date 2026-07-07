// Thin client for Open-Meteo. Batches every city's lat/lon into a single
// HTTP request (Open-Meteo supports comma-separated lat/lon lists), which
// matters at scale: 200+ cities as 200+ requests would blow the $50/day API
// budget mentioned in the brief. One request covers every city we track.

const BASE_URL = "https://api.open-meteo.com/v1/forecast";

/**
 * @param {{city: string, latitude: number, longitude: number}[]} locations
 * @returns {Promise<Record<string, {temperature: number, rainfall: number, observedAt: string}>>}
 */
export async function fetchWeatherForCities(locations) {
  if (locations.length === 0) return {};

  const lats = locations.map((l) => l.latitude).join(",");
  const lons = locations.map((l) => l.longitude).join(",");

  const url = `${BASE_URL}?latitude=${lats}&longitude=${lons}&current=temperature_2m,precipitation&timezone=auto`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // Open-Meteo returns a single object when given one location, and an
  // array of objects (one per location, same order as the request) when
  // given multiple. Normalize to an array so downstream code is uniform.
  const results = Array.isArray(data) ? data : [data];

  if (results.length !== locations.length) {
    throw new Error(
      `Open-Meteo returned ${results.length} results for ${locations.length} requested locations`
    );
  }

  const byCity = {};
  results.forEach((result, i) => {
    const city = locations[i].city;
    const current = result?.current;

    if (
      !current ||
      typeof current.temperature_2m !== "number" ||
      typeof current.precipitation !== "number"
    ) {
      // Malformed entry for this one city -- don't let it poison every
      // other city's reading. Caller decides how to handle a missing city.
      byCity[city] = null;
      return;
    }

    byCity[city] = {
      temperature: current.temperature_2m,
      rainfall: current.precipitation,
      observedAt: current.time ?? new Date().toISOString(),
    };
  });

  return byCity;
}
