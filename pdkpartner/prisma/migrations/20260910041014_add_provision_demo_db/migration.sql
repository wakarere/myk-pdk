-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrgConfig" (
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
    "provisionDemoDb" BOOLEAN NOT NULL DEFAULT false,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OrgConfig" ("cloudProvider", "createdAt", "databricksHost", "databricksPatToken", "databricksWarehouseId", "destination", "fivetranAccount", "fivetranApiKey", "fivetranApiSecret", "gcpKeyFilePath", "gcpProjectId", "gcpZone", "id", "orgName", "setupComplete", "snowflakeAccount", "snowflakePatToken", "snowflakeUser", "snowflakeWarehouse", "updatedAt") SELECT "cloudProvider", "createdAt", "databricksHost", "databricksPatToken", "databricksWarehouseId", "destination", "fivetranAccount", "fivetranApiKey", "fivetranApiSecret", "gcpKeyFilePath", "gcpProjectId", "gcpZone", "id", "orgName", "setupComplete", "snowflakeAccount", "snowflakePatToken", "snowflakeUser", "snowflakeWarehouse", "updatedAt" FROM "OrgConfig";
DROP TABLE "OrgConfig";
ALTER TABLE "new_OrgConfig" RENAME TO "OrgConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
