ALTER TABLE "RadarConfig"
  ADD COLUMN IF NOT EXISTS "autoScanEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastScanAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextScanAt" TIMESTAMP(3);

UPDATE "RadarConfig"
SET "autoScanEnabled" = COALESCE("autoScanEnabled", "ativo", true)
WHERE "autoScanEnabled" IS DISTINCT FROM COALESCE("autoScanEnabled", "ativo", true);

CREATE TABLE IF NOT EXISTS "ScanRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "radarConfigId" TEXT,
  "status" TEXT NOT NULL,
  "mode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "totalFound" INTEGER NOT NULL DEFAULT 0,
  "totalNew" INTEGER NOT NULL DEFAULT 0,
  "totalUpdated" INTEGER NOT NULL DEFAULT 0,
  "totalFailed" INTEGER NOT NULL DEFAULT 0,
  "diagnostics" JSONB,

  CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScanSourceRun" (
  "id" TEXT NOT NULL,
  "scanRunId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "found" INTEGER NOT NULL DEFAULT 0,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "errorMsg" TEXT,
  "diagnostics" JSONB,

  CONSTRAINT "ScanSourceRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ListingSnapshot" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "scanRunId" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "price" INTEGER,
  "title" TEXT,
  "city" TEXT,
  "state" TEXT,
  "year" INTEGER,
  "mileage" INTEGER,
  "opportunityScore" INTEGER,
  "riskScore" INTEGER,
  "marginAmount" INTEGER,
  "marginPercent" DOUBLE PRECISION,
  "status" TEXT,
  "rawPayload" JSONB,

  CONSTRAINT "ListingSnapshot_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ScanRun_userId_fkey'
  ) THEN
    ALTER TABLE "ScanRun"
      ADD CONSTRAINT "ScanRun_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ScanRun_radarConfigId_fkey'
  ) THEN
    ALTER TABLE "ScanRun"
      ADD CONSTRAINT "ScanRun_radarConfigId_fkey"
      FOREIGN KEY ("radarConfigId") REFERENCES "RadarConfig"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ScanSourceRun_scanRunId_fkey'
  ) THEN
    ALTER TABLE "ScanSourceRun"
      ADD CONSTRAINT "ScanSourceRun_scanRunId_fkey"
      FOREIGN KEY ("scanRunId") REFERENCES "ScanRun"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ListingSnapshot_listingId_fkey'
  ) THEN
    ALTER TABLE "ListingSnapshot"
      ADD CONSTRAINT "ListingSnapshot_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ListingSnapshot_scanRunId_fkey'
  ) THEN
    ALTER TABLE "ListingSnapshot"
      ADD CONSTRAINT "ListingSnapshot_scanRunId_fkey"
      FOREIGN KEY ("scanRunId") REFERENCES "ScanRun"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ScanRun_userId_startedAt_idx" ON "ScanRun"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "ScanRun_radarConfigId_startedAt_idx" ON "ScanRun"("radarConfigId", "startedAt");
CREATE INDEX IF NOT EXISTS "ScanRun_status_startedAt_idx" ON "ScanRun"("status", "startedAt");
CREATE INDEX IF NOT EXISTS "ScanSourceRun_scanRunId_source_idx" ON "ScanSourceRun"("scanRunId", "source");
CREATE INDEX IF NOT EXISTS "ScanSourceRun_source_startedAt_idx" ON "ScanSourceRun"("source", "startedAt");
CREATE INDEX IF NOT EXISTS "ListingSnapshot_listingId_capturedAt_idx" ON "ListingSnapshot"("listingId", "capturedAt");
CREATE INDEX IF NOT EXISTS "ListingSnapshot_scanRunId_capturedAt_idx" ON "ListingSnapshot"("scanRunId", "capturedAt");
