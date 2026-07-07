-- CreateTable
CREATE TABLE "Campaign" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lineItemId" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "creativeId" TEXT NOT NULL,
    "creativeName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "state" TEXT NOT NULL,
    "bid" REAL NOT NULL,
    "dailyBudget" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LineItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CityState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "city" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'AUTO',
    "activeCreativeId" TEXT,
    "lastTemperature" REAL,
    "lastRainfall" REAL,
    "lastReason" TEXT,
    "lastDecisionAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "healthStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DecisionHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "city" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature" REAL,
    "rainfall" REAL,
    "selectedCreativeId" TEXT NOT NULL,
    "previousCreativeId" TEXT,
    "reason" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SystemStatus" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lastSuccessfulSync" DATETIME,
    "provider" TEXT NOT NULL DEFAULT 'open-meteo',
    "healthStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastErrorMessage" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LineItem_lineItemId_key" ON "LineItem"("lineItemId");

-- CreateIndex
CREATE INDEX "LineItem_city_idx" ON "LineItem"("city");

-- CreateIndex
CREATE UNIQUE INDEX "CityState_city_key" ON "CityState"("city");

-- CreateIndex
CREATE INDEX "DecisionHistory_city_idx" ON "DecisionHistory"("city");

-- CreateIndex
CREATE INDEX "DecisionHistory_timestamp_idx" ON "DecisionHistory"("timestamp");
