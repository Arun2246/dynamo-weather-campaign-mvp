# DynaMo MVP — Write-up

## What I built and why

**Data model.** Twelve `LineItem` rows (4 cities × 3 creatives), matching
the starter CSV and the brief's literal definition of a line item — one
creative/location pair with its own active/paused state, bid, and daily
budget. A separate `CityState` table holds per-city automation state
(AUTO/MANUAL mode, last weather reading, active creative, health), and
`DecisionHistory` is an append-only log of every transition, automated or
manual. Splitting these apart means the 12-line-item requirement ("logs
every transition") and the per-city automation concept don't fight each
other in one table.

**Tech choices.** React + Vite, Node + Express, Prisma + SQLite, all
running locally with zero external services — matches the "constraints
that matter" section's spirit (12 line items, one API call per sync) while
staying honest about what changes at scale (see tradeoffs below).
Open-Meteo needs no API key and, critically, supports batching many
lat/lon pairs into a single request — so the whole campaign is one weather
call, not one call per city.

**Decision logic.** A pure function, `decideCreative(weather)`, holding
the three-tier priority rule (rain ≥ 2.5mm → rainy; else temp ≥ 35°C →
hot; else → normal). It has no DB or network dependency, so it's testable
in isolation and easy to swap out later. The sync service wraps it with
comparison-before-write ("update campaign only when state changes") and
the two failure modes from the design doc: retain on transient fetch
failure, fall back to the safe default after 30 minutes stale.

**Visibility layer.** One dashboard table (city, temperature, rainfall,
active creative, reason, mode, health, last updated), matching the
design's column list exactly. Clicking a row opens a details drawer with
the underlying line items, override controls, and per-city decision
history — so the CMO's two requirements (trust, visibility) both have a
concrete home: trust via reason strings and health indicators; visibility
via history and drilldown.

## Three tradeoffs

1. **One weather call for all cities, not per-city polling with staggered
   intervals.** I chose simplicity: fetch everyone every 15 minutes.
   At 4 cities this is free either way. At 200+ cities, a single fixed
   interval either wastes budget (polling calm cities as often as volatile
   ones) or under-serves volatile ones. With more time I'd move to
   adaptive polling — poll more often during weather transitions (e.g. near
   a rain/no-rain boundary) and less often when a city has been stable for
   hours.

2. **No forecast, only current conditions.** The design doc explicitly
   scopes forecast-aware decisioning out, and I kept it that way — it
   avoids a whole class of "which forecast horizon do we trust" decisions.
   The real cost: a line item can flip on, run for a few minutes, and flip
   back if a rain cell passes through and out within one poll cycle. I
   didn't add debouncing/hysteresis (e.g. "only flip if the new state
   persists across two consecutive syncs") because it adds a second kind
   of state per city and the brief's tolerance for staleness (~15 min) is
   already the dominant lag. I'd add hysteresis before this went to a real
   spend budget.

3. **Manual override is per-city, not per-line-item.** The design doc says
   "supported per city," so overriding always pauses the other two
   creatives in that city and activates one. This is simpler to reason
   about for the CMO ("Mumbai is on manual, showing Beat the Heat") but
   means you can't, say, manually force two creatives active at once for a
   test. I'd revisit this if CoolSip ever wanted split-testing within a
   city.

## Three edge cases the MVP handles badly

1. **A city renamed or added mid-campaign.** `CityState.city` and
   `LineItem.city` are matched by string equality with no foreign key
   between them and no admin UI to add/remove a city. Adding Kolkata today
   means editing the CSV and re-seeding. **Fix:** promote `City` to its own
   table with an id, and have `LineItem`/`CityState` reference it by id,
   not by string.

2. **Two operators overriding the same city at once.** There's no
   optimistic locking — the last `POST /override` wins silently, and the
   loser doesn't know they were overwritten. With one CMO's small team this
   is unlikely to bite, but it's a real gap. **Fix:** return the current
   `CityState.updatedAt` version with every GET and require it on write
   (optimistic concurrency), rejecting stale writes with a clear error.

3. **Open-Meteo returns a plausible-looking but wrong reading** (e.g. a
   transient model glitch reports 45°C in Mumbai in July). The rules engine
   has no sanity bounds — it will happily activate "Beat the heat" on bad
   data. **Fix:** clamp/validate incoming readings against a plausible
   range per city (e.g. reject temperature deltas of >15°C from the last
   reading without at least one confirming poll), and surface an
   "anomalous reading, held for review" state instead of auto-applying it.

## Stretch question: adding new trigger types

**Data model change.** Replace the weather-specific fields on `CityState`
with a generic `signal` concept:

```
Signal      { id, sourceType, key (e.g. "Mumbai"), value (JSON), observedAt }
Rule        { id, sourceType, priority, condition (JSON), creativeId }
Decision    { id, key, creativeId, reason, contributingSignals (JSON), triggerSource }
```

`sourceType` is `"weather" | "cricket" | "stocks" | "aqi" | "traffic"`.
Each source's client (weather.js today) becomes one of several adapters
that all produce the same shape: `{ sourceType, key, value, observedAt }`.
The rules engine becomes a priority-ordered list of `(sourceType,
condition) → creative` rules evaluated against the latest signal per
source per key, instead of one hardcoded `if/else` chain.

**The right abstraction.** What stays the same across every trigger:
- a **key** to scope the signal to (city, for weather/AQI/traffic; maybe
  "national" for cricket/stocks)
- a **fetch → validate → store** pipeline per source, on its own poll
  interval (cricket scores change on a very different cadence than
  weather)
- a **priority-ordered rule evaluation** against the latest known signal(s)
  for a key
- **compare-before-write** and **history logging**, unchanged

What varies: the shape of `value` (temperature+rainfall vs. match
result vs. index delta vs. AQI number), the poll cadence, and — this is
the part worth calling out — whether a trigger is *scoped to a city* at
all. Weather and traffic are city-scoped; cricket and stock moves are
national and would apply the same rule to every city simultaneously. The
`key` field needs to support both, e.g. a signal keyed `"*"` that every
city's rule evaluation falls back to when no city-specific signal exists
for that source.

**New failure modes multi-trigger introduces.**

- **Conflicting triggers with no priority defined between sources.** If
  "India wins → beer ad" and "Nifty crashes → gold ad" both fire in the
  same evaluation window for the same city, which wins? The single
  priority list needs to be cross-source, not per-source — e.g. an
  explicit global ordering (safety/brand-risk triggers like weather always
  outrank celebratory ones like cricket), decided by the business, not
  inferred at runtime.
- **Stale signal masquerading as fresh.** Today, "stale" is one concept
  (weather >30 min old). With five sources on five cadences, a
  cricket-score signal from yesterday's match must not silently count as
  "India won" today. Every signal needs its own staleness window, and a
  rule referencing a stale signal should fail closed (skip that rule)
  rather than use outdated data.
- **Partial signal availability.** If AQI is down but weather is fine,
  does the AQI rule silently not apply (fine), or does the whole decision
  for that city halt (safer but noisier)? This needs to be a per-rule
  policy, not a global one — losing weather data probably should halt
  automation (brand risk), losing AQI data probably shouldn't.
