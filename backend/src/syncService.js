import { fetchWeatherForCities } from "./weather.js";
import { decideCreative } from "./decisionEngine.js";

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes, per design doc

/**
 * Runs one full weather sync + decision cycle for every city.
 * This is the "Scheduler -> Fetch weather -> Validate -> Evaluate rules ->
 * Compare -> Update -> Record -> Refresh dashboard" flow from Section 4.
 */
export async function runWeatherSync(prisma) {
  const cityStates = await prisma.cityState.findMany();
  const lineItems = await prisma.lineItem.findMany();

  // One representative lat/lon per city (all line items in a city share
  // the same coordinates in the starter data).
  const locations = cityStates.map((cs) => {
    const li = lineItems.find((l) => l.city === cs.city);
    return { city: cs.city, latitude: li.latitude, longitude: li.longitude };
  });

  let weatherByCity;
  let fetchError = null;

  try {
    weatherByCity = await fetchWeatherForCities(locations);
  } catch (err) {
    fetchError = err;
    weatherByCity = {};
  }

  const now = new Date();
  const results = [];

  for (const cityState of cityStates) {
    const reading = weatherByCity[cityState.city];
    const result = await syncOneCity({ prisma, cityState, reading, fetchError, now });
    results.push(result);
  }

  // Update system-wide status.
  await prisma.systemStatus.upsert({
    where: { id: 1 },
    update: {
      lastSuccessfulSync: fetchError ? undefined : now,
      healthStatus: fetchError ? "ERROR" : "OK",
      lastErrorMessage: fetchError ? fetchError.message : null,
    },
    create: {
      id: 1,
      lastSuccessfulSync: fetchError ? null : now,
      healthStatus: fetchError ? "ERROR" : "OK",
      lastErrorMessage: fetchError ? fetchError.message : null,
    },
  });

  return { results, fetchError: fetchError?.message ?? null, syncedAt: now };
}

async function syncOneCity({ prisma, cityState, reading, fetchError, now }) {
  // Manual override: automation is paused for this city. Leave line items
  // and CityState untouched, but still surface staleness/health so the
  // dashboard doesn't silently show old data as if it were fresh.
  if (cityState.mode === "MANUAL") {
    return { city: cityState.city, skipped: "MANUAL_MODE" };
  }

  const staleSinceLastSync =
    cityState.lastSyncedAt && now - new Date(cityState.lastSyncedAt) > STALE_AFTER_MS;

  // Case 1: this fetch failed outright, or returned no usable data for
  // this city (e.g. malformed entry). Per design doc: "If weather fetch
  // fails, retain current campaign" -- UNLESS we've now gone stale for
  // more than 30 minutes, in which case fall back to the safe default.
  if (fetchError || !reading) {
    if (staleSinceLastSync || !cityState.lastSyncedAt) {
      return fallBackToSafeDefault({
        prisma,
        cityState,
        now,
        reason: fetchError
          ? `Weather fetch failed and last successful sync was over 30 minutes ago (${fetchError.message})`
          : "Weather fetch failed and last successful sync was over 30 minutes ago",
      });
    }

    // Retain current campaign, just mark health as degraded.
    await prisma.cityState.update({
      where: { city: cityState.city },
      data: { healthStatus: "ERROR" },
    });
    return { city: cityState.city, skipped: "RETAINED_ON_FETCH_ERROR" };
  }

  // Case 2: we have a fresh reading. Run the rules engine.
  const { creativeId, reason } = decideCreative(reading);
  return applyDecision({
    prisma,
    cityState,
    creativeId,
    reason,
    temperature: reading.temperature,
    rainfall: reading.rainfall,
    now,
    healthStatus: "OK",
  });
}

async function fallBackToSafeDefault({ prisma, cityState, now, reason }) {
  return applyDecision({
    prisma,
    cityState,
    creativeId: "CR-NORM",
    reason,
    temperature: null,
    rainfall: null,
    now,
    healthStatus: "STALE",
    markSynced: false, // this cycle did NOT produce a fresh reading
  });
}

/**
 * Compares the desired creative against current state; only writes to the
 * DB (and only logs history) when something actually changes, per Section
 * 4: "Update campaign only when state changes."
 */
async function applyDecision({
  prisma,
  cityState,
  creativeId,
  reason,
  temperature,
  rainfall,
  now,
  healthStatus,
  markSynced = true,
}) {
  const changed = cityState.activeCreativeId !== creativeId;

  if (changed) {
    // Pause every line item in this city, then activate the winning one.
    await prisma.lineItem.updateMany({
      where: { city: cityState.city },
      data: { state: "PAUSED" },
    });
    await prisma.lineItem.updateMany({
      where: { city: cityState.city, creativeId },
      data: { state: "ACTIVE" },
    });

    await prisma.decisionHistory.create({
      data: {
        city: cityState.city,
        temperature,
        rainfall,
        selectedCreativeId: creativeId,
        previousCreativeId: cityState.activeCreativeId,
        reason,
        triggerSource: "AUTO",
      },
    });
  }

  await prisma.cityState.update({
    where: { city: cityState.city },
    data: {
      activeCreativeId: creativeId,
      lastTemperature: temperature,
      lastRainfall: rainfall,
      lastReason: reason,
      lastDecisionAt: changed ? now : cityState.lastDecisionAt,
      lastSyncedAt: markSynced ? now : cityState.lastSyncedAt,
      healthStatus,
    },
  });

  return { city: cityState.city, changed, creativeId };
}
