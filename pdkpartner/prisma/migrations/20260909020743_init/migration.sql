-- CreateTable
CREATE TABLE "OrgConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "orgName" TEXT NOT NULL,
    "cloudProvider" TEXT NOT NULL,
    "gcpProjectId" TEXT,
    "gcpZone" TEXT,
    "gcpKeyFilePath" TEXT,
    "fivetranAccount" TEXT NOT NULL,
    "fivetranApiKey" TEXT NOT NULL,
    "fivetranApiSecret" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "snowflakeAccount" TEXT,
    "snowflakeUser" TEXT,
    "snowflakePatToken" TEXT,
    "snowflakeWarehouse" TEXT,
    "databricksHost" TEXT,
    "databricksPatToken" TEXT,
    "databricksWarehouseId" TEXT,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Demo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "blueprint" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'us-central1-a',
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "DemoLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "demoId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoLog_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Demo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DemoResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "demoId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoResource_demoId_fkey" FOREIGN KEY ("demoId") REFERENCES "Demo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Demo_runId_key" ON "Demo"("runId");
