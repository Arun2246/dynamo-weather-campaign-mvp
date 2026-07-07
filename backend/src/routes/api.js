import { Router } from "express";
import { runWeatherSync } from "../syncService.js";

export function buildApiRouter(prisma) {
  const router = Router();

  // GET /campaigns
  // Dashboard's main feed: one row per city, with its line items nested.
  router.get("/campaigns", async (req, res) => {
    try {
      const cityStates = await prisma.cityState.findMany({ orderBy: { city: "asc" } });
      const lineItems = await prisma.lineItem.findMany({ orderBy: { lineItemId: "asc" } });
      const systemStatus = await prisma.systemStatus.findUnique({ where: { id: 1 } });

      const cities = cityStates.map((cs) => ({
        city: cs.city,
        mode: cs.mode,
        activeCreativeId: cs.activeCreativeId,
        temperature: cs.lastTemperature,
        rainfall: cs.lastRainfall,
        reason: cs.lastReason,
        lastDecisionAt: cs.lastDecisionAt,
        lastSyncedAt: cs.lastSyncedAt,
        healthStatus: cs.healthStatus,
        lineItems: lineItems.filter((li) => li.city === cs.city),
      }));

      res.json({ cities, systemStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /history?city=Mumbai&limit=50
  router.get("/history", async (req, res) => {
    try {
      const { city, limit } = req.query;
      const history = await prisma.decisionHistory.findMany({
        where: city ? { city } : undefined,
        orderBy: { timestamp: "desc" },
        take: limit ? parseInt(limit, 10) : 100,
      });
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /system-status
  router.get("/system-status", async (req, res) => {
    try {
      const status = await prisma.systemStatus.findUnique({ where: { id: 1 } });
      res.json({ status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /weather/sync -- manually trigger a sync cycle (also useful for
  // the demo, so we don't have to wait 15 minutes to show it working).
  router.post("/weather/sync", async (req, res) => {
    try {
      const result = await runWeatherSync(prisma);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /override  { city, creativeId }
  // Puts a city into MANUAL mode and immediately switches the active
  // creative to whatever the CMO's team chose. Logged as a MANUAL decision.
  router.post("/override", async (req, res) => {
    try {
      const { city, creativeId } = req.body;
      if (!city || !creativeId) {
        return res.status(400).json({ error: "city and creativeId are required" });
      }

      const cityState = await prisma.cityState.findUnique({ where: { city } });
      if (!cityState) return res.status(404).json({ error: `Unknown city: ${city}` });

      const validCreative = await prisma.lineItem.findFirst({ where: { city, creativeId } });
      if (!validCreative) {
        return res.status(400).json({ error: `Unknown creativeId ${creativeId} for city ${city}` });
      }

      await prisma.lineItem.updateMany({ where: { city }, data: { state: "PAUSED" } });
      await prisma.lineItem.updateMany({
        where: { city, creativeId },
        data: { state: "ACTIVE" },
      });

      const now = new Date();
      await prisma.decisionHistory.create({
        data: {
          city,
          selectedCreativeId: creativeId,
          previousCreativeId: cityState.activeCreativeId,
          reason: "Manual override by CoolSip campaign team",
          triggerSource: "MANUAL",
        },
      });

      await prisma.cityState.update({
        where: { city },
        data: {
          mode: "MANUAL",
          activeCreativeId: creativeId,
          lastReason: "Manual override by CoolSip campaign team",
          lastDecisionAt: now,
        },
      });

      res.json({ ok: true, city, creativeId, mode: "MANUAL" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /resume-automation  { city }
  router.post("/resume-automation", async (req, res) => {
    try {
      const { city } = req.body;
      if (!city) return res.status(400).json({ error: "city is required" });

      const cityState = await prisma.cityState.findUnique({ where: { city } });
      if (!cityState) return res.status(404).json({ error: `Unknown city: ${city}` });

      await prisma.cityState.update({
        where: { city },
        data: { mode: "AUTO" },
      });

      // Immediately re-evaluate this one city so the dashboard reflects
      // real conditions right away rather than waiting for the next tick.
      await runWeatherSync(prisma);

      res.json({ ok: true, city, mode: "AUTO" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
