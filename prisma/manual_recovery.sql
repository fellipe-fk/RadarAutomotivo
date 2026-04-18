ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'CAMINHAO';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Plano') THEN
    CREATE TYPE "Plano" AS ENUM ('BASICO', 'PRO', 'AGENCIA');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssinaturaStatus') THEN
    CREATE TYPE "AssinaturaStatus" AS ENUM ('TRIAL', 'ATIVA', 'CANCELADA', 'SUSPENSA', 'ENCERRADA');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CrmStatus') THEN
    CREATE TYPE "CrmStatus" AS ENUM ('INTERESSE', 'NEGOCIANDO', 'COMPRADO', 'REVENDIDO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "phone" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zipCode" TEXT,
  "raioKm" INTEGER NOT NULL DEFAULT 120,
  "consumoKmL" DOUBLE PRECISION NOT NULL DEFAULT 12,
  "avatarUrl" TEXT,
  "plano" "Plano" NOT NULL DEFAULT 'PRO',
  "assinaturaStatus" "AssinaturaStatus" NOT NULL DEFAULT 'TRIAL',
  "trialEndsAt" TIMESTAMP(3),
  "assinaturaEndsAt" TIMESTAMP(3),
  "abacatepayCustomerId" TEXT,
  "abacatepaySubscriptionId" TEXT,
  "creditosLaudo" INTEGER NOT NULL DEFAULT 3,
  "telegramChatId" TEXT,
  "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
  "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
  "emailAlertas" BOOLEAN NOT NULL DEFAULT true,
  "silencioNoturno" BOOLEAN NOT NULL DEFAULT true,
  "margemMinima" INTEGER NOT NULL DEFAULT 1500,
  "focoTipo" TEXT NOT NULL DEFAULT 'TODOS',
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE INDEX IF NOT EXISTS "Listing_userId_idx" ON "Listing"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Listing_userId_fkey'
  ) THEN
    ALTER TABLE "Listing"
      ADD CONSTRAINT "Listing_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "Alert"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMsg" TEXT;

ALTER TABLE "Alert"
  ALTER COLUMN "listingId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Alert_userId_idx" ON "Alert"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Alert_userId_fkey'
  ) THEN
    ALTER TABLE "Alert"
      ADD CONSTRAINT "Alert_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Alert_listingId_fkey'
  ) THEN
    ALTER TABLE "Alert"
      ADD CONSTRAINT "Alert_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Session_userId_fkey'
  ) THEN
    ALTER TABLE "Session"
      ADD CONSTRAINT "Session_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "RadarConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "modelos" TEXT[] NOT NULL DEFAULT ARRAY['XRE 300', 'CB 500', 'Fazer 250']::TEXT[],
  "fontes" TEXT[] NOT NULL DEFAULT ARRAY['olx', 'facebook', 'webmotors']::TEXT[],
  "tipo" TEXT NOT NULL DEFAULT 'TODOS',
  "precoMax" DOUBLE PRECISION NOT NULL DEFAULT 35000,
  "kmMax" INTEGER NOT NULL DEFAULT 80000,
  "distanciaMax" INTEGER NOT NULL DEFAULT 120,
  "scoreMin" INTEGER NOT NULL DEFAULT 70,
  "riscoMax" TEXT NOT NULL DEFAULT 'MEDIO',
  "anoMin" INTEGER NOT NULL DEFAULT 2018,
  "margemMin" DOUBLE PRECISION NOT NULL DEFAULT 1500,
  "frequenciaMin" INTEGER NOT NULL DEFAULT 60,
  "scoreAlerta" INTEGER NOT NULL DEFAULT 75,
  CONSTRAINT "RadarConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RadarConfig_userId_key" ON "RadarConfig"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RadarConfig_userId_fkey'
  ) THEN
    ALTER TABLE "RadarConfig"
      ADD CONSTRAINT "RadarConfig_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "CrmItem" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "listingId" TEXT,
  "title" TEXT NOT NULL,
  "precoCompra" DOUBLE PRECISION,
  "precoVenda" DOUBLE PRECISION,
  "status" "CrmStatus" NOT NULL DEFAULT 'INTERESSE',
  "notes" TEXT,
  "plate" TEXT,
  "year" INTEGER,
  "mileage" INTEGER,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "CrmItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmItem_listingId_key" ON "CrmItem"("listingId");
CREATE INDEX IF NOT EXISTS "CrmItem_userId_idx" ON "CrmItem"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CrmItem_userId_fkey'
  ) THEN
    ALTER TABLE "CrmItem"
      ADD CONSTRAINT "CrmItem_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CrmItem_listingId_fkey'
  ) THEN
    ALTER TABLE "CrmItem"
      ADD CONSTRAINT "CrmItem_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Laudo" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "placa" TEXT NOT NULL,
  "renavam" TEXT,
  "resultado" JSONB NOT NULL,
  "scoreCompra" INTEGER,
  "situacao" TEXT,
  "pdfUrl" TEXT,
  "custoCreditoUsado" INTEGER NOT NULL DEFAULT 1,
  "valorCobrado" DOUBLE PRECISION NOT NULL DEFAULT 19,
  CONSTRAINT "Laudo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Laudo_userId_idx" ON "Laudo"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Laudo_userId_fkey'
  ) THEN
    ALTER TABLE "Laudo"
      ADD CONSTRAINT "Laudo_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Pagamento" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "valor" DOUBLE PRECISION NOT NULL,
  "descricao" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "externalReferenceId" TEXT,
  "billingEvent" TEXT,
  "abacatepayId" TEXT,
  "abacatepayPaymentId" TEXT,
  "tipo" TEXT NOT NULL,
  CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Pagamento_abacatepayId_key" ON "Pagamento"("abacatepayId");
CREATE INDEX IF NOT EXISTS "Pagamento_userId_idx" ON "Pagamento"("userId");
CREATE INDEX IF NOT EXISTS "Pagamento_externalReferenceId_idx" ON "Pagamento"("externalReferenceId");
CREATE INDEX IF NOT EXISTS "Pagamento_abacatepayPaymentId_idx" ON "Pagamento"("abacatepayPaymentId");
CREATE INDEX IF NOT EXISTS "Pagamento_userId_tipo_createdAt_idx" ON "Pagamento"("userId", "tipo", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Pagamento_userId_fkey'
  ) THEN
    ALTER TABLE "Pagamento"
      ADD CONSTRAINT "Pagamento_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "LoginAttempt" (
  "id" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

CREATE TABLE IF NOT EXISTS "RateLimitEntry" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RateLimitEntry_key_createdAt_idx" ON "RateLimitEntry"("key", "createdAt");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuditLog_userId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "SecurityLog" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SecurityLog_event_createdAt_idx" ON "SecurityLog"("event", "createdAt");
