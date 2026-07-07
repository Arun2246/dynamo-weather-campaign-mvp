import { runWeatherSync } from "./syncService.js";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes, per design doc

export function startScheduler(prisma, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const tick = async () => {
    try {
      const { results, fetchError } = await runWeatherSync(prisma);
      const changedCities = results.filter((r) => r.changed).map((r) => r.city);
      if (fetchError) {
        console.warn(`[scheduler] weather sync completed with error: ${fetchError}`);
      } else if (changedCities.length > 0) {
        console.log(`[scheduler] sync complete. Creative changed for: ${changedCities.join(", ")}`);
      } else {
        console.log("[scheduler] sync complete. No changes.");
      }
    } catch (err) {
      // Should be rare -- runWeatherSync already catches fetch-level errors.
      // This guards against unexpected DB/programming errors so one bad
      // tick doesn't kill the interval timer.
      console.error("[scheduler] unexpected error during sync:", err);
    }
  };

  // Run once immediately on boot, then on the configured interval.
  tick();
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
