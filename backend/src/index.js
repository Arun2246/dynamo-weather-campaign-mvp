import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { buildApiRouter } from "./routes/api.js";
import { startScheduler } from "./scheduler.js";

const PORT = process.env.PORT || 4000;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "", 10) || 15 * 60 * 1000;

const prisma = new PrismaClient();

async function main() {
  // Fail fast with a friendly message if the DB hasn't been seeded yet,
  // rather than serving an empty dashboard with no explanation.
  const lineItemCount = await prisma.lineItem.count();
  if (lineItemCount === 0) {
    console.error(
      "\nNo line items found in the database.\n" +
        "Run the following once before starting the server:\n\n" +
        "  npx prisma migrate dev --name init\n" +
        "  npm run seed\n"
    );
    process.exit(1);
  }

  const app = express();

  app.use(cors());
  
  app.use(express.json());
  
  // Root endpoint for humans
  
  app.get("/", (req, res) => {
  
    res.json({
  
      service: "DynaMo Weather Campaign API",
  
      status: "running",
  
      version: "1.0.0",
  
      health: "/health",
  
      campaigns: "/campaigns",
  
    });
  
  });
  
  app.use("/", buildApiRouter(prisma));
  
  app.get("/health", (req, res) => res.json({ ok: true }));

  app.listen(PORT, () => {
    console.log(`DynaMo backend listening on http://localhost:${PORT}`);
  });

  startScheduler(prisma, { intervalMs: POLL_INTERVAL_MS });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
