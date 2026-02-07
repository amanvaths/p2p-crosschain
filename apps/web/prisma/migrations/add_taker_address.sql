-- Migration: Add takerAddress field to orders table
-- This field stores the taker (counterparty) address from OrderMatched/OrderCompleted events

ALTER TABLE "orders" 
ADD COLUMN IF NOT EXISTS "takerAddress" VARCHAR(42);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS "orders_takerAddress_idx" ON "orders"("takerAddress");

