# P2P Atomic Exchange - Complete System Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Complete System Flow](#complete-system-flow)
4. [Components Breakdown](#components-breakdown)
5. [API Documentation](#api-documentation)
6. [Frontend Flow](#frontend-flow)
7. [Indexer Flow](#indexer-flow)
8. [Database Schema](#database-schema)
9. [Smart Contracts](#smart-contracts)
10. [Setup & Deployment](#setup--deployment)

---

## Overview

**P2P Atomic Exchange** is an enterprise-grade peer-to-peer cross-chain atomic exchange platform that enables users to trade tokens between BSC (Binance Smart Chain) and DSC (DSC Chain) using Hash Time Lock Contracts (HTLC) and a vault-based order matching system.

### Key Features

- ✅ **Cross-Chain Trading**: Trade USDT between BSC and DSC chains
- ✅ **Atomic Swaps**: HTLC-based secure cross-chain swaps
- ✅ **Order Book System**: Create buy/sell orders with fixed 1:1 rate
- ✅ **Partial Fills**: Orders can be partially filled by multiple takers
- ✅ **Real-time Indexing**: Blockchain events indexed in real-time
- ✅ **Trade History**: Complete history with maker/taker addresses and transaction hashes
- ✅ **Volume Tracking**: Real-time volume and locked amount tracking

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Home Page  │  │ Trade History│  │  Create Order│         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│                    ┌───────▼────────┐                          │
│                    │  API Routes    │                          │
│                    │  (Next.js API) │                          │
│                    └───────┬────────┘                          │
└────────────────────────────┼────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
│   PostgreSQL   │  │     Redis       │  │   Indexer      │
│   Database     │  │   (Optional)     │  │   Service      │
└────────────────┘  └─────────────────┘  └───────┬────────┘
                                                    │
        ┌──────────────────────────────────────────┘
        │
┌───────▼────────┐  ┌──────────────┐
│  BSC Chain     │  │  DSC Chain   │
│  (Chain ID: 56)│  │ (Chain ID:   │
│                │  │    1555)     │
│  P2PVaultBSC   │  │ P2PVaultDSC  │
└────────────────┘  └──────────────┘
```

### Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, TailwindCSS, Wagmi, RainbowKit
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **Indexer**: Node.js, Viem, TypeScript
- **Blockchain**: Viem, Wagmi
- **Smart Contracts**: Solidity (Foundry)

---

## Complete System Flow

### 1. Order Creation Flow

```
User (Frontend)
    │
    ├─> 1. Connect Wallet (RainbowKit)
    │
    ├─> 2. Select Order Type (Buy/Sell)
    │
    ├─> 3. Enter Amount
    │
    ├─> 4. Approve USDT Spending
    │      └─> ERC20.approve(vaultAddress, amount)
    │
    ├─> 5. Create Order Transaction
    │      └─> P2PVault.createBuyOrder(amount) [BSC]
    │      └─> P2PVault.createSellOrder(amount) [DSC]
    │
    ├─> 6. Transaction Confirmed
    │      └─> OrderCreated Event Emitted
    │
    └─> 7. Indexer Processes Event
           │
           ├─> Fetches Event from Blockchain
           ├─> Decodes Event (OrderCreated)
           ├─> Stores Event in Database
           ├─> Creates Order Record
           └─> Updates User Stats
```

### 2. Order Matching Flow

```
Taker (Frontend)
    │
    ├─> 1. Browse Orders (from Database API)
    │      └─> GET /api/p2p/orders?chainId=56&status=OPEN
    │
    ├─> 2. Select Order to Fill
    │
    ├─> 3. Approve USDT (if needed)
    │
    ├─> 4. Fill Order Transaction
    │      └─> P2PVaultDSC.fillBscBuyOrder(bscOrderId, buyer, amount)
    │
    ├─> 5. Bridge Relayer Detects Match
    │      └─> Calls matchOrder() on both chains
    │
    ├─> 6. OrderMatched Events Emitted
    │
    └─> 7. Indexer Updates Order Status
           └─> Status: OPEN → MAKER_LOCKED
```

### 3. Order Completion Flow

```
Bridge Relayer
    │
    ├─> 1. Monitor Matched Orders
    │
    ├─> 2. Wait for DSC Transaction Confirmation
    │
    ├─> 3. Complete Order on BSC
    │      └─> P2PVaultBSC.completeOrder(orderId, seller, dscTxHash)
    │
    ├─> 4. OrderCompleted Event Emitted
    │
    └─> 5. Indexer Updates Order Status
           └─> Status: MAKER_LOCKED → COMPLETED
           └─> Updates User Stats (volume, completed count)
```

### 4. Data Flow: Frontend → API → Database

```
Frontend Component (page.tsx)
    │
    ├─> useDbOrders() Hook
    │      └─> Fetches from /api/p2p/orders
    │
    ├─> API Route (/api/p2p/orders/route.ts)
    │      │
    │      ├─> 1. Parse Query Parameters
    │      │      └─> status, chainId, maker, limit, offset
    │      │
    │      ├─> 2. Query Database (Prisma)
    │      │      └─> prisma.order.findMany({ where, include: { events, escrows } })
    │      │
    │      ├─> 3. For MATCHED Orders: Fetch Remaining Amount from Contract
    │      │      └─> contract.getOrder(orderId) → calculate remaining
    │      │
    │      ├─> 4. Extract Taker Address from Events
    │      │      └─> OrderMatched/OrderCompleted events contain seller/buyer
    │      │
    │      ├─> 5. Collect Transaction Hashes
    │      │      └─> All events related to order
    │      │
    │      └─> 6. Return Serialized Data
    │             └─> { orders, total, totalLocked, ... }
    │
    └─> Frontend Displays Orders
           └─> Maps orders to UI components
           └─> Shows maker/taker, chains, transaction hashes
```

### 5. Indexer Flow: Blockchain → Database

```
Indexer Service (index.ts)
    │
    ├─> 1. Initialize
    │      ├─> Connect to Database
    │      ├─> Initialize RPC Clients (BSC, DSC)
    │      └─> Start Health Monitoring
    │
    ├─> 2. Polling Loop (Every 3-5 seconds)
    │      │
    │      ├─> For Each Chain (BSC, DSC):
    │      │      │
    │      │      ├─> Get Last Indexed Block from Database
    │      │      │      └─> indexerState.lastBlockNumber
    │      │      │
    │      │      ├─> Get Current Block from RPC
    │      │      │      └─> currentBlock - confirmations
    │      │      │
    │      │      ├─> Fetch Logs in Batches
    │      │      │      └─> client.getLogs({ address: vaultAddress, fromBlock, toBlock })
    │      │      │
    │      │      ├─> Process Each Log
    │      │      │      │
    │      │      │      ├─> Decode Event (Viem)
    │      │      │      │      └─> decodeEventLog({ abi, data, topics })
    │      │      │      │
    │      │      │      ├─> Store Raw Event
    │      │      │      │      └─> prisma.event.upsert()
    │      │      │      │
    │      │      │      └─> Process Event Based on Type
    │      │      │              │
    │      │      │              ├─> OrderCreated
    │      │      │              │      └─> Create Order Record
    │      │      │              │      └─> Update User Stats
    │      │      │              │
    │      │      │              ├─> OrderMatched
    │      │      │              │      └─> Update Order Status → MAKER_LOCKED
    │      │      │              │
    │      │      │              ├─> OrderCompleted
    │      │      │              │      └─> Update Order Status → COMPLETED
    │      │      │              │      └─> Update User Volume
    │      │      │              │
    │      │      │              └─> OrderCancelled
    │      │      │                      └─> Update Order Status → CANCELLED
    │      │      │
    │      │      └─> Update Indexer State
    │      │              └─> prisma.indexerState.upsert({ lastBlockNumber: toBlock })
    │      │
    │      └─> Wait for Next Poll (3-5 seconds)
    │
    └─> 3. Handle Reorgs
           └─> Check if stored block hash matches current
           └─> If mismatch: Rollback and mark events as removed
```

---

## Components Breakdown

### Frontend Components

#### 1. **Home Page** (`apps/web/src/app/page.tsx`)

**Purpose**: Main trading interface with buy/sell tabs

**Key Features**:

- Display public orders (from database)
- Filter by type (buy/sell), chain, amount
- Create new orders (modal)
- Cancel own orders
- Show platform stats (total volume, orders, users)
- Display total locked amount per chain

**Data Flow**:

```typescript
// Fetch orders from database
const { orders: dbOrders } = useDbOrders({
  limit: 200,
  status: "all",
});

// Fetch stats
const { stats } = useDbStats();

// Fetch locked amount from contract
useEffect(() => {
  fetch(`/api/p2p/locked-amount?chainId=${activeChainId}`)
    .then((res) => res.json())
    .then((data) => setChainLockedAmount(data.totalLocked));
}, [activeTab]);
```

**Key Functions**:

- `handleCreateOrder()`: Approve USDT → Create order transaction
- `handleCancelOrder()`: Cancel order transaction
- `handleTradeClick()`: Open trade modal (for future implementation)

#### 2. **Trade History Page** (`apps/web/src/app/trade-history/page.tsx`)

**Purpose**: Display all orders with detailed trade information

**Key Features**:

- Show all orders (all statuses)
- Filter by status, type, chain
- Display maker and taker addresses
- Show both source and destination chains
- Display all transaction hashes (clickable links)
- Partial trade indicator
- Pagination

**Data Display**:

- **Maker**: Order creator address
- **Taker**: Counterparty address (extracted from OrderMatched events)
- **Chains**: Source → Destination (e.g., BSC → DSC)
- **Transactions**: All event transaction hashes (OrderCreated, OrderMatched, OrderCompleted, etc.)

#### 3. **Create Order Modal** (`apps/web/src/app/page.tsx` - CreateOrderModal)

**Purpose**: Modal for creating new buy/sell orders

**Flow**:

1. User selects order type (buy/sell)
2. User enters amount
3. System checks if wallet is connected
4. System checks if correct chain is selected
5. User approves USDT spending (if needed)
6. User creates order transaction
7. Wait for confirmation
8. Order appears in list (after indexer processes)

### API Routes

#### 1. **GET /api/p2p/orders** (`apps/web/src/app/api/p2p/orders/route.ts`)

**Purpose**: Fetch orders from database with filters

**Query Parameters**:

- `status`: Order status (OPEN, COMPLETED, etc.) or 'all'
- `chainId`: Filter by chain (56 for BSC, 1555 for DSC)
- `maker`: Filter by maker address
- `limit`: Number of orders to return (default: 50)
- `offset`: Pagination offset (default: 0)
- `minAmount` / `maxAmount`: Amount filters

**Response**:

```json
{
  "orders": [
    {
      "id": "uuid",
      "orderId": "8",
      "chainId": 56,
      "maker": "0x...",
      "takerAddress": "0x...", // Extracted from events
      "sellAmount": "573500000000000000000", // Remaining amount for MATCHED orders
      "status": "MAKER_LOCKED",
      "isPartialTrade": true,
      "transactionHashes": [
        {
          "eventName": "OrderCreated",
          "txHash": "0x...",
          "chainId": 56,
          "createdAt": "2024-01-01T00:00:00Z"
        },
        {
          "eventName": "OrderMatched",
          "txHash": "0x...",
          "chainId": 56,
          "createdAt": "2024-01-01T00:05:00Z"
        }
      ],
      "srcChainId": 56,
      "dstChainId": 1555,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 9,
  "totalLocked": "683.43", // Total locked in USDT for displayed orders
  "limit": 50,
  "offset": 0,
  "hasMore": false
}
```

**Processing Logic**:

1. Query database with filters
2. Include related events and escrows
3. For MATCHED/MAKER_LOCKED orders: Fetch remaining amount from contract
4. Extract taker address from OrderMatched/OrderCompleted events
5. Collect all transaction hashes from events
6. Serialize BigInt values to strings

#### 2. **GET /api/p2p/stats** (`apps/web/src/app/api/p2p/stats/route.ts`)

**Purpose**: Get platform or user statistics

**Query Parameters**:

- `address` (optional): User address for user-specific stats

**Response (Platform)**:

```json
{
  "totalOrders": 9,
  "openOrders": 1,
  "completedOrders": 6,
  "totalUsers": 5,
  "totalVolume": "1577.0", // In USDT
  "recentOrders": [...]
}
```

**Response (User)**:

```json
{
  "user": {
    "address": "0x...",
    "ordersCreated": 3,
    "ordersCompleted": 2,
    "totalVolume": "1000.0"
  },
  "openOrders": 1,
  "completedOrders": 2,
  "pendingEscrows": 0
}
```

#### 3. **GET /api/p2p/locked-amount** (`apps/web/src/app/api/p2p/locked-amount/route.ts`)

**Purpose**: Get total locked amount from contract (real-time)

**Query Parameters**:

- `chainId`: Chain ID (56 for BSC, 1555 for DSC)

**Response**:

```json
{
  "chainId": 56,
  "totalLocked": "683.43" // In USDT
}
```

**Processing**:

1. Create public client for chain
2. Call `contract.totalLocked()` function
3. Convert from wei to USDT (divide by 1e18)

### Indexer Service

#### Main Entry Point (`apps/indexer/src/index.ts`)

**Purpose**: Continuously index blockchain events and update database

**Key Functions**:

- `main()`: Main loop that polls chains
- `syncChain()`: Sync blocks for a specific chain
- `handleReorg()`: Detect and handle chain reorganizations

**Polling Strategy**:

- Polls every 3-5 seconds (configurable)
- Processes blocks in batches (max 5000 blocks per query)
- Handles large block ranges by splitting into smaller chunks
- Updates indexer state after each batch

#### Event Processors (`apps/indexer/src/processors/vault.ts`)

**Purpose**: Process vault contract events

**Event Types**:

1. **OrderCreated**:

   - Creates order record in database
   - Status: OPEN
   - Updates user stats (ordersCreated++)

2. **OrderMatched**:

   - Updates order status: OPEN → MAKER_LOCKED
   - Links event to order

3. **OrderCompleted**:

   - Updates order status: MAKER_LOCKED → COMPLETED
   - Updates user stats (ordersCompleted++, totalVolume)

4. **OrderCancelled**:

   - Updates order status: OPEN → CANCELLED
   - Updates cancelled flag

5. **OrderRefunded**:
   - Updates order status: → REFUNDED

**Processing Flow**:

```typescript
1. Decode event log (Viem)
2. Store raw event in database
3. Process based on event type
4. Update order/user records
5. Mark event as processed
```

#### Connection Manager (`apps/indexer/src/connection-manager.ts`)

**Purpose**: Handle RPC and database connections with retry logic

**Features**:

- Automatic reconnection on failure
- Exponential backoff retry
- Health monitoring
- Connection pooling

---

## Database Schema

### Core Tables

#### 1. **Order** (`orders`)

Stores all orders from both chains.

**Key Fields**:

- `orderId`: On-chain order ID (BigInt, unique)
- `chainId`: Chain where order was created
- `maker`: Order creator address
- `sellAmount` / `buyAmount`: Order amounts (stored as String for BigInt)
- `srcChainId` / `dstChainId`: Source and destination chains
- `status`: OrderStatus enum (OPEN, MAKER_LOCKED, TAKER_LOCKED, COMPLETED, etc.)
- `txHash`: Transaction hash of order creation
- `blockNumber` / `logIndex`: Block and log index for event

**Relations**:

- `events`: All events related to this order
- `escrows`: Escrow locks for this order

#### 2. **Event** (`events`)

Stores raw blockchain events for reorg tolerance.

**Key Fields**:

- `eventName`: Event name (OrderCreated, OrderMatched, etc.)
- `txHash`: Transaction hash
- `blockNumber` / `blockHash`: Block information
- `args`: Event arguments (JSON)
- `processed`: Whether event has been processed
- `removed`: For reorg handling

**Relations**:

- `order`: Optional relation to order (via orderId)

#### 3. **IndexerState** (`indexer_states`)

Tracks indexer progress per chain.

**Key Fields**:

- `chainId`: Chain ID (unique)
- `lastBlockNumber`: Last indexed block
- `lastBlockHash`: Hash of last indexed block (for reorg detection)

#### 4. **User** (`users`)

Tracks user statistics.

**Key Fields**:

- `address`: User wallet address (unique)
- `ordersCreated`: Number of orders created
- `ordersCompleted`: Number of orders completed
- `totalVolume`: Total trading volume (String for BigInt)

---

## Smart Contracts

### P2PVaultBSC (`packages/contracts/src/P2PVaultBSCv2.sol`)

**Purpose**: Vault contract on BSC for buy orders

**Key Functions**:

- `createBuyOrder(amount)`: Create a buy order (locks USDT)
- `cancelOrder(orderId)`: Cancel an order (refunds USDT)
- `getOrder(orderId)`: Get order details
- `totalLocked()`: Get total locked USDT

**Order Structure**:

```solidity
struct Order {
    address user;
    OrderStatus status;
    OrderType orderType;
    uint256 amount;
    uint256 filledAmount; // For partial fills
    uint256 createdAt;
    uint256 expiresAt;
}
```

**Events**:

- `OrderCreated(orderId, user, orderType, amount, expiresAt)`
- `OrderFilled(bscOrderId, dscOrderId, filler, amount, isPartial)`
- `OrderCompleted(orderId, user, totalAmount, fillCount)`
- `OrderCancelled(orderId, user, refundAmount)`

### P2PVaultDSC (`packages/contracts/src/P2PVaultDSCv2.sol`)

**Purpose**: Vault contract on DSC for sell orders

**Similar structure to P2PVaultBSC but for sell orders**

---

## Setup & Deployment

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- PostgreSQL
- Redis (optional)
- Foundry (for contracts)

### Installation

```bash
# Clone repository
git clone <repository>
cd p2p

# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push database schema
pnpm db:push
```

### Environment Variables

Create `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/p2p_exchange"

# Redis (optional)
REDIS_URL="redis://localhost:6379"
SKIP_REDIS=true

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="your_project_id"

# BSC Chain
NEXT_PUBLIC_CHAIN_A_ID=56
NEXT_PUBLIC_CHAIN_A_NAME="BSC"
NEXT_PUBLIC_CHAIN_A_RPC_URL="https://bsc-dataseed1.binance.org"
NEXT_PUBLIC_CHAIN_A_VAULT_CONTRACT="0x841dEfA71568711C4fdc439917b41FA294428D91"
NEXT_PUBLIC_CHAIN_A_USDT_CONTRACT="0x55d398326f99059fF775485246999027B3197955"

# DSC Chain
NEXT_PUBLIC_CHAIN_B_ID=1555
NEXT_PUBLIC_CHAIN_B_NAME="DSC Chain"
NEXT_PUBLIC_CHAIN_B_RPC_URL="https://rpc01.dscscan.io/"
NEXT_PUBLIC_CHAIN_B_VAULT_CONTRACT="0x9c2B0cD6Ea9058B542D50905E8E08DdF0503c013"
NEXT_PUBLIC_CHAIN_B_USDT_CONTRACT="0xbc27aCEac6865dE31a286Cd9057564393D5251CB"

# Indexer
INDEXER_START_BLOCK_A=76910700
INDEXER_START_BLOCK_B=8774300
INDEXER_POLL_INTERVAL_MS=3000
MAX_BLOCKS_PER_QUERY=5000
REORG_TOLERANCE_BLOCKS=64
```

### Running the Application

```bash
# Start frontend and API (development)
pnpm dev

# Start indexer (separate terminal)
pnpm indexer:start
```

### Production Build

```bash
# Build all packages
pnpm build

# Start production server
cd apps/web
pnpm start

# Start indexer
cd apps/indexer
pnpm start
```

---

## Key System Features Explained

### 1. Real-time Order Display

**How it works**:

1. Frontend fetches orders from `/api/p2p/orders`
2. API queries database (indexed by indexer)
3. For MATCHED orders, API fetches remaining amount from contract
4. Frontend displays orders with real-time data

**Why database + contract**:

- Database: Fast queries, historical data, all statuses
- Contract: Accurate remaining amounts for partial fills

### 2. Total Locked Amount

**How it works**:

1. Frontend calls `/api/p2p/locked-amount?chainId=56`
2. API calls `contract.totalLocked()` directly from blockchain
3. Returns real-time locked amount in USDT

**Why direct contract call**:

- Most accurate (contract maintains totalLocked state)
- Includes all locked funds (OPEN + MATCHED orders)

### 3. Trade History with Maker/Taker

**How it works**:

1. API fetches orders with related events
2. Extracts taker address from `OrderMatched` or `OrderCompleted` events
3. Collects all transaction hashes from events
4. Frontend displays maker, taker, chains, and all transaction links

**Event Args Structure**:

- `OrderMatched`: `{ orderId, buyer, seller, amount }`
- `OrderCompleted`: `{ orderId, buyer, seller, amount, dscTxHash }`

### 4. Partial Trade Detection

**How it works**:

1. For MATCHED orders, API calls `contract.getOrder(orderId)`
2. Gets `amount` and `filledAmount`
3. Calculates `remaining = amount - filledAmount`
4. If `filledAmount > 0 && remaining > 0`: Partial trade

### 5. Indexer Reorg Handling

**How it works**:

1. Indexer stores `lastBlockHash` with `lastBlockNumber`
2. On each poll, checks if stored hash matches current block hash
3. If mismatch: Reorg detected
4. Rolls back to safe block (lastBlockNumber - reorgToleranceBlocks)
5. Marks events as `removed: true`
6. Re-indexes from safe block

---

## API Endpoints Summary

| Endpoint                 | Method | Purpose                         | Response                         |
| ------------------------ | ------ | ------------------------------- | -------------------------------- |
| `/api/p2p/orders`        | GET    | Fetch orders with filters       | `{ orders, total, totalLocked }` |
| `/api/p2p/orders`        | POST   | Create order (used by indexer)  | Order object                     |
| `/api/p2p/stats`         | GET    | Platform/user statistics        | Stats object                     |
| `/api/p2p/locked-amount` | GET    | Get locked amount from contract | `{ chainId, totalLocked }`       |
| `/api/p2p/history`       | GET    | User trade history              | `{ history }`                    |
| `/api/user`              | POST   | Create/update user              | User object                      |
| `/api/health`            | GET    | Health check                    | `{ status: "ok" }`               |

---

## Frontend Hooks

### `useDbOrders(params)`

Fetches orders from database API.

**Returns**:

- `orders`: Array of orders
- `total`: Total count
- `totalLocked`: Total locked amount
- `loading`: Loading state
- `error`: Error state
- `refetch`: Function to refetch

### `useDbStats(address?)`

Fetches platform or user statistics.

**Returns**:

- `stats`: Stats object
- `loading`: Loading state
- `error`: Error state
- `refetch`: Function to refetch

### `useP2PIntegration()`

Smart contract integration hooks (for creating orders, cancelling, etc.)

---

## Indexer Configuration

### Polling Intervals

- **BSC**: 3 seconds (fast block time)
- **DSC**: 5 seconds

### Block Processing

- **Max blocks per query**: 5000
- **Confirmations**: 3 blocks
- **Reorg tolerance**: 64 blocks

### Start Blocks

- **BSC**: Configured via `INDEXER_START_BLOCK_A`
- **DSC**: Configured via `INDEXER_START_BLOCK_B`

Set these to the block number when contracts were deployed to avoid indexing old blocks.

---

## Troubleshooting

### Orders Not Showing

1. Check indexer is running: `pnpm indexer:start`
2. Check indexer logs for errors
3. Verify `INDEXER_START_BLOCK_*` is set correctly
4. Check database has orders: `SELECT COUNT(*) FROM orders;`

### Locked Amount Mismatch

1. Check contract `totalLocked()` directly
2. Verify indexer is processing `OrderCreated` events
3. Check for MATCHED orders that aren't in database

### Events Not Linked to Orders

1. Check `events` table has `orderId` set
2. Verify event `args` contain correct `orderId`
3. Check indexer is processing events correctly

---

## Development

### Adding New Features

1. **New API Endpoint**: Add route in `apps/web/src/app/api/`
2. **New Frontend Page**: Add page in `apps/web/src/app/`
3. **New Event Type**: Add processor in `apps/indexer/src/processors/`
4. **Database Changes**: Update `schema.prisma` and run `pnpm db:push`

### Testing

```bash
# Run tests
pnpm test

# Run frontend tests
cd apps/web && pnpm test

# Run contract tests
cd packages/contracts && forge test
```

---

## License

MIT

---

## Support

For issues and questions, please open an issue on GitHub.
