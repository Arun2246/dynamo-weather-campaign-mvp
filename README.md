# DynaMo MVP — CoolSip Campaign Automation

A working MVP of DynaMo: it pulls live weather for CoolSip's four launch
cities, decides which of the three creatives should be running in each
city, updates line item state, logs every transition, and gives CoolSip's
team a dashboard to see (and override) what's running and why.

Built to the product/solution design doc as source of truth. See
[`WRITEUP.md`](./WRITEUP.md) for the tradeoffs, edge cases, and the
stretch-question answer.

## Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **ORM:** Prisma
- **Database:** SQLite (single file, zero setup)
- **Weather:** [Open-Meteo](https://open-meteo.com/) (no API key required)

No Docker, no cloud services, no auth. Runs entirely on your machine.

## Prerequisites

- **Node.js 18+** (native `fetch` is used — Node 20+ recommended). Check with:
  ```bash
  node --version
  ```
- Internet access, for two things only: fetching Prisma's SQLite engine on
  first install, and live calls to the Open-Meteo API.

## Setup

Two terminal tabs: one for the backend, one for the frontend.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # defaults are already fine for local use
npx prisma migrate dev --name init   # creates dev.db and applies the schema
npm run seed                  # loads the 12 starter line items from the CSV
npm run dev                   # starts the API on http://localhost:4000
```

On boot, the server immediately runs one weather sync (so you don't have
to wait), then repeats every 15 minutes (`POLL_INTERVAL_MS` in `.env`).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env          # points the UI at http://localhost:4000
npm run dev                   # starts the dashboard on http://localhost:5173
```

Open **http://localhost:5173**. You should see 4 cities, each showing its
current temperature, rainfall, active creative, and the reason for that
decision.

### Re-running from scratch

```bash
cd backend
rm -f prisma/dev.db
npx prisma migrate dev --name init
npm run seed
```

## Using it

- **Dashboard table** — one row per city: temperature, rainfall, active
  creative, the reason it's active, automation mode, health, and last
  updated time.
- **"Sync weather now"** — triggers an immediate weather fetch + decision
  cycle instead of waiting for the 15-minute scheduler. Useful for demoing
  without waiting, and for forcing a re-check after you fix a network issue.
- **Click a city** — opens a details drawer with:
  - current weather and decision reason
  - the underlying 3 line items for that city (one per creative) and their
    active/paused state, bid, and daily budget
  - manual override buttons (force a specific creative; this also flips
    the city to `MANUAL` mode so the scheduler leaves it alone)
  - "Resume automation" to hand control back to the rules engine
  - full decision history for that city, both automated and manual

## Architecture

```
React Dashboard (Vite, :5173)
        │  fetch (CORS)
        ▼
Express REST API (:4000)
        │
        ▼
Campaign Rules Engine (pure function: weather → creative + reason)
        │
        ▼
Prisma ORM
        │
        ▼
SQLite (backend/prisma/dev.db)

Scheduler (setInterval, every 15 min)
        │
        ▼
Open-Meteo (single batched request for all 4 cities)
```

### Data model

The design doc's entity model (Section 6) defines `LineItem` around a
per-city "active creative" concept. The assessment brief and the provided
`line_items.csv` define a line item literally: one row per creative+city
pair (12 rows — 4 cities × 3 creatives), each independently active/paused
— which is also what's needed to satisfy "logs every transition" at the
line-item level. This implementation keeps the literal 12-row structure
(`LineItem`) and layers the design doc's per-city concepts (`activeCreativeId`,
`mode`, health) on top in a separate `CityState` table. At any moment
exactly one `LineItem` per city is `ACTIVE`; that row's creative *is* the
design doc's "activeCreative". This isn't a redesign — the design doc's
`LineItem` fields all still exist, just split across two tables so the
literal 12-line-item requirement and the per-city automation state don't
collide. See `backend/prisma/schema.prisma` for the full schema and the
reasoning comment at the top.

| Table | Purpose |
|---|---|
| `Campaign` | The one CoolSip campaign. |
| `LineItem` | 12 rows: creative × city, with state/bid/budget. |
| `CityState` | Per-city automation mode, latest weather, active creative, health. |
| `DecisionHistory` | Append-only log of every creative transition, AUTO or MANUAL. |
| `SystemStatus` | Single row: last successful sync, provider, health. |

### Decision rules (Section 3 of the design doc)

1. Rain ≥ 2.5mm → **Rainy day pick-me-up**
2. Temp ≥ 35°C and rain < 2.5mm → **Beat the heat**
3. Otherwise → **Refresh anytime**

Implemented as a pure function in `backend/src/decisionEngine.js` — no
DB or network access — so the rules can be tested in isolation and swapped
out later (see the stretch-question answer in `WRITEUP.md`).

### Failure handling (Section 3)

- Weather fetch fails → retain the current campaign, mark health `ERROR`.
- Fetch fails (or a city is missing from the response) **and** the last
  successful sync for that city was more than 30 minutes ago → fall back
  to `Refresh anytime` and mark health `STALE`.
- Either way, the dashboard shows the last successful sync time and the
  reason, so CoolSip's team always knows if they're looking at stale data.

### Manual override (Section 3)

Overriding a city sets `CityState.mode = MANUAL` and is logged to
`DecisionHistory` with `triggerSource: MANUAL`. While in `MANUAL` mode, the
scheduler skips that city entirely — it won't be overwritten by the next
auto-sync. "Resume automation" flips it back to `AUTO` and immediately
re-evaluates.

## REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/campaigns` | All cities with weather, decision, health, and nested line items |
| GET | `/history?city=&limit=` | Decision history, optionally filtered by city |
| GET | `/system-status` | Last successful sync, provider, health |
| POST | `/weather/sync` | Trigger an immediate sync cycle |
| POST | `/override` `{ city, creativeId }` | Force a creative for a city, switch to MANUAL |
| POST | `/resume-automation` `{ city }` | Switch a city back to AUTO |

## Project layout

```
dynamo-mvp/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # entity model
│   │   ├── seed.js            # loads line_items.csv
│   │   └── line_items.csv     # starter data (provided)
│   └── src/
│       ├── index.js           # Express app + boot
│       ├── weather.js         # Open-Meteo client
│       ├── decisionEngine.js  # pure rules engine
│       ├── syncService.js     # fetch → decide → persist → log
│       ├── scheduler.js       # 15-minute polling loop
│       └── routes/api.js      # REST endpoints
└── frontend/
    └── src/
        ├── App.jsx
        ├── api.js             # backend client
        ├── creatives.js       # creative id → label/icon
        └── components/
            ├── StatusBar.jsx
            ├── CityTable.jsx
            └── DetailsDrawer.jsx
```

## Troubleshooting

- **"No line items found in the database"** on backend startup — you
  haven't run migrate + seed yet (see Setup above).
- **Dashboard shows "Couldn't reach the backend"** — make sure the backend
  is running on port 4000 and `frontend/.env`'s `VITE_API_BASE_URL` matches.
- **`npx prisma migrate dev` fails to download an engine** — you're
  offline, or a firewall is blocking `binaries.prisma.sh`. This step needs
  internet access once; after that Prisma's engine is cached locally.
- **Health stays `STALE`/`ERROR`** — check backend logs; usually means
  Open-Meteo is unreachable from your network. Click "Sync weather now"
  after restoring connectivity.
