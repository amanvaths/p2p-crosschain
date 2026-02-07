# Transaction Hash Issue - Root Cause & Solution

## Problem
Transaction hashes are showing as empty (`—`) in the Trade History page for all orders.

## Root Cause
1. **Orders were synced directly from contract** using `sync-existing-orders.ts` which set placeholder `txHash: '0x0000...'`
2. **Events exist in database** but are not properly linked to orders via `orderId` foreign key
3. **Event search query is not finding events** because:
   - Events might be on different chains (BSC vs DSC)
   - OrderId format in event args might not match
   - Events table might not have events for these orders

## Current Status
- API tries to find events by searching `args` JSON field
- API tries to fetch from blockchain as fallback (limited to first 10 orders)
- Frontend shows "—" when no txHash is found

## Proper Solution

### Option 1: Re-index Historical Events (Recommended)
Run the indexer to process all historical events and properly link them to orders:

```bash
# Make sure indexer start block is set to contract deployment block
# In .env: INDEXER_START_BLOCK_A=76810700 (or earlier)

# Restart indexer to process all events
cd apps/indexer
pnpm start
```

### Option 2: Backfill Events for Existing Orders
Create and run a script to:
1. Query blockchain for `OrderCreated` events for each order
2. Store events in database
3. Link events to orders via `orderId`

### Option 3: Update Orders with Real txHash
Run a script to:
1. Query blockchain for `OrderCreated` event for each order
2. Update order's `txHash` field directly

## Quick Fix Applied
- Frontend now shows truncated txHash if available
- Falls back to order.txHash if transactionHashes array is empty
- Shows "—" only if both are missing/placeholder

## Next Steps
1. **Check if events exist in database:**
   ```sql
   SELECT COUNT(*) FROM events WHERE "eventName" = 'OrderCreated';
   ```

2. **Check if events are linked:**
   ```sql
   SELECT COUNT(*) FROM events WHERE "orderId" IS NOT NULL;
   ```

3. **If events exist but not linked, run linking script:**
   - Create script to match events to orders by orderId in args
   - Update events.orderId for all matching events

4. **If events don't exist, re-run indexer:**
   - Set INDEXER_START_BLOCK_A to contract deployment block
   - Let indexer process all historical events

## Temporary Workaround
The frontend now handles missing txHash gracefully. For a permanent fix, ensure:
1. Indexer is running and processing all events
2. Events are properly linked to orders
3. Order.txHash is updated from OrderCreated events

