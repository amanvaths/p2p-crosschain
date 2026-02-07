# Transaction Hash Fix - All Orders

## Current Status
- Only 1 order (Order #4) shows transaction hash: `0xa9f8de...`
- All other orders show "—" (empty)

## Root Cause
1. **Events not in database**: Orders were synced from contract but their `OrderCreated` events were not indexed
2. **Blockchain fetch limited**: API only fetches for first 20 orders per request to avoid rate limiting
3. **Block range issues**: Some orders might be outside the search range

## Fixes Applied

### 1. Improved Event Search
- Now searches across all chains (BSC, DSC, srcChain, dstChain)
- Multiple query patterns to find events by orderId
- Merges events from relation and raw query

### 2. Improved Blockchain Fetch
- Removed limit (was 10, now processes first 20 per request)
- Better block range calculation using order creation time
- Batch processing for large block ranges
- Better error handling

### 3. Frontend Display
- Shows truncated txHash: `0x12345678...`
- Falls back to order.txHash if transactionHashes array is empty
- Shows "—" only if both are missing/placeholder

## Permanent Solution

### Option 1: Re-index All Events (Recommended)
```bash
# Set indexer start block to contract deployment
# In .env: INDEXER_START_BLOCK_A=76810700

# Restart indexer
cd apps/indexer
pnpm start
```

### Option 2: Backfill Script
Create a script to:
1. Query blockchain for `OrderCreated` events for all orders
2. Store events in database
3. Link events to orders
4. Update order.txHash

### Option 3: Background Job
Create a background job that:
- Processes orders in batches
- Fetches txHash from blockchain
- Updates database
- Runs periodically to catch new orders

## Immediate Workaround

The API now:
- Fetches txHash for first 20 orders per request
- Subsequent requests will fetch next 20 orders
- Eventually all orders will have txHash

**To see all txHashes:**
1. Refresh the page multiple times (each time fetches 20 more)
2. Or wait for indexer to re-index all events
3. Or run backfill script

## Testing

Check if txHash is being fetched:
```bash
curl "http://localhost:3000/api/p2p/orders?limit=5" | jq '.orders[] | {orderId, txHash: (.txHash | .[0:20]), hasEvents: (.transactionHashes | length)}'
```

Expected: All orders should eventually have txHash after multiple requests or after indexer runs.

