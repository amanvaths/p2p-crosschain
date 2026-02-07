# Debug Issues List - Orders Not Showing

## Issues Found:

### 1. ✅ Database has 0 orders
- **Status**: CONFIRMED
- **Details**: Database query shows 0 orders
- **Impact**: No orders to display in frontend

### 2. ⚠️ Indexer found OrderCancelled but no OrderCreated
- **Status**: CONFIRMED  
- **Details**: 
  - Found 1 OrderCancelled event (orderId: 4, block 77926915)
  - No OrderCreated event for that order
- **Impact**: Orders were created but indexer didn't catch OrderCreated events
- **Possible Causes**:
  - Indexer started syncing AFTER orders were created
  - Start block (76910700) is too high - orders created before this
  - Vault contract address mismatch
  - OrderCreated events not being emitted or decoded correctly

### 3. ⚠️ Indexer syncing but not processing OrderCreated
- **Status**: NEEDS VERIFICATION
- **Details**: Indexer is at block 79683041 (BSC) but no orders found
- **Impact**: New orders might not be indexed
- **Possible Causes**:
  - Event decoding failing silently
  - Wrong contract address
  - Events not matching ABI

### 4. ⚠️ API endpoints returning empty arrays
- **Status**: CONFIRMED
- **Details**: Both /api/p2p/orders and /api/orders return []
- **Impact**: Frontend can't fetch orders
- **Root Cause**: Database has no orders (issue #1)

### 5. ⚠️ Frontend might not be calling correct endpoint
- **Status**: NEEDS VERIFICATION
- **Details**: useDbOrders calls /api/p2p/orders
- **Impact**: If endpoint is wrong, orders won't load

## Resolution Plan:

1. Check indexer start block - might be too high
2. Manually query blockchain for OrderCreated events
3. Verify vault contract address is correct
4. Check if indexer is processing events correctly
5. Test creating a new order and see if it gets indexed
6. Fix frontend to handle empty state better

