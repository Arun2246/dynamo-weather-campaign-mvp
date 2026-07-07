// Seeds the database from the starter line_items.csv.
// Run with: npm run seed  (also runs automatically on first `npm run dev`
// if the DB is empty -- see src/index.js)

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h.trim()] = cells[i]?.trim()));
    return row;
  });
}

async function main() {
  const csvPath = path.join(__dirname, "line_items.csv");
  const csv = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(csv);

  const campaign = await prisma.campaign.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "CoolSip Summer 2026", status: "ACTIVE" },
  });

  const cities = [...new Set(rows.map((r) => r.city))];

  for (const row of rows) {
    // CSV ships with an initial guess at active/paused. We treat "Refresh
    // anytime" (CR-NORM) as the safe default starting state for every city
    // regardless of what the CSV says, since real weather hasn't been
    // fetched yet -- the first weather sync will correct this immediately.
    const startState = row.creative_id === "CR-NORM" ? "ACTIVE" : "PAUSED";

    await prisma.lineItem.upsert({
      where: { lineItemId: row.line_item_id },
      update: {},
      create: {
        lineItemId: row.line_item_id,
        campaignId: campaign.id,
        creativeId: row.creative_id,
        creativeName: row.creative_name,
        city: row.city,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        state: startState,
        bid: parseFloat(row.bid_inr),
        dailyBudget: parseFloat(row.daily_budget_inr),
      },
    });
  }

  for (const city of cities) {
    await prisma.cityState.upsert({
      where: { city },
      update: {},
      create: {
        city,
        mode: "AUTO",
        activeCreativeId: "CR-NORM",
        lastReason: "Awaiting first weather sync",
        healthStatus: "UNKNOWN",
      },
    });
  }

  await prisma.systemStatus.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, provider: "open-meteo", healthStatus: "UNKNOWN" },
  });

  console.log(`Seeded ${rows.length} line items across ${cities.length} cities.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
