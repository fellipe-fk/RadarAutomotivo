DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'asaasCustomerId'
  ) THEN
    ALTER TABLE "User" RENAME COLUMN "asaasCustomerId" TO "abacatepayCustomerId";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'asaasSubscriptionId'
  ) THEN
    ALTER TABLE "User" RENAME COLUMN "asaasSubscriptionId" TO "abacatepaySubscriptionId";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Pagamento' AND column_name = 'asaasId'
  ) THEN
    ALTER TABLE "Pagamento" RENAME COLUMN "asaasId" TO "abacatepayId";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Pagamento' AND column_name = 'asaasPaymentId'
  ) THEN
    ALTER TABLE "Pagamento" RENAME COLUMN "asaasPaymentId" TO "abacatepayPaymentId";
  END IF;
END $$;

ALTER TABLE "User"
  ALTER COLUMN "plano" SET DEFAULT 'PRO';

ALTER TABLE "Pagamento"
  ADD COLUMN IF NOT EXISTS "externalReferenceId" TEXT,
  ADD COLUMN IF NOT EXISTS "billingEvent" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Pagamento_asaasId_key'
  ) THEN
    ALTER INDEX "Pagamento_asaasId_key" RENAME TO "Pagamento_abacatepayId_key";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pagamento_externalReferenceId_idx" ON "Pagamento"("externalReferenceId");
CREATE INDEX IF NOT EXISTS "Pagamento_abacatepayPaymentId_idx" ON "Pagamento"("abacatepayPaymentId");
CREATE INDEX IF NOT EXISTS "Pagamento_userId_tipo_createdAt_idx" ON "Pagamento"("userId", "tipo", "createdAt");
