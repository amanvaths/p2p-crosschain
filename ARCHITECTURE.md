# P2P Cross-Chain Atomic Exchange - Architecture Document

## Overview

This system implements a non-custodial, trust-minimized peer-to-peer cross-chain atomic exchange using Hash Time-Locked Contracts (HTLC). The backend serves only as an indexer and coordinator—all funds are held exclusively in smart contracts.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Browse     │  │  Create     │  │  Order      │  │  RainbowKit         │ │
│  │  Orders     │  │  Order      │  │  Details    │  │  Wallet Connect     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                │                     │           │
│         └────────────────┴────────────────┴─────────────────────┘           │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │   wagmi v2 Hooks   │                              │
│                          │   viem Client      │                              │
│                          └─────────┬─────────┘                              │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
         ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐
         │   Chain A    │  │  Backend    │  │    Chain B      │
         │  (Sepolia)   │  │  Indexer    │  │  (Base Sepolia) │
         │              │  │  + API      │  │                 │
         │ ┌──────────┐ │  │             │  │ ┌──────────┐    │
         │ │Orderbook │ │  │ ┌─────────┐ │  │ │Orderbook │    │
         │ └──────────┘ │  │ │Postgres │ │  │ └──────────┘    │
         │ ┌──────────┐ │  │ └─────────┘ │  │ ┌──────────┐    │
         │ │  Escrow  │ │  │ ┌─────────┐ │  │ │  Escrow  │    │
         │ │  HTLC    │ │  │ │  Redis  │ │  │ │  HTLC    │    │
         │ └──────────┘ │  │ └─────────┘ │  │ └──────────┘    │
         └──────────────┘  └─────────────┘  └─────────────────┘
```

## Atomic Swap Flow

```
Timeline:
─────────────────────────────────────────────────────────────────────────────►

Phase 1: Order Creation & Maker Lock
├─ Maker generates secret S locally
├─ Maker computes hashLock H = keccak256(S)
├─ Maker creates order on Chain A Orderbook
└─ Maker locks sellToken in Chain A Escrow (timelock T1 = 24h)

Phase 2: Taker Lock
├─ Taker finds order via API/indexer
├─ Taker locks buyToken on Chain B Escrow (same H, timelock T2 = 12h < T1)
└─ Both parties have funds locked

Phase 3: Maker Claim (Secret Reveal)
├─ Maker claims on Chain B by providing secret S
├─ S is revealed in transaction calldata
└─ Maker receives buyToken on Chain B

Phase 4: Taker Claim
├─ Taker reads S from Chain B transaction
├─ Taker claims on Chain A using S
└─ Taker receives sellToken on Chain A

Fallback: Refund after timelock
├─ If T2 expires: Taker can refund on Chain B
└─ If T1 expires: Maker can refund on Chain A
```

## Project Structure

```
p2p/
├── apps/
│   ├── web/                      # Next.js Frontend + API Routes
│   │   ├── src/
│   │   │   ├── app/              # App Router pages
│   │   │   │   ├── page.tsx      # Browse orders
│   │   │   │   ├── create/       # Create order flow
│   │   │   │   ├── order/[id]/   # Order details
│   │   │   │   └── api/          # API routes
│   │   │   │       ├── orders/
│   │   │   │       └── health/
│   │   │   ├── components/       # React components
│   │   │   ├── hooks/            # Custom wagmi hooks
│   │   │   ├── lib/              # Utilities
│   │   │   └── providers/        # Context providers
│   │   └── prisma/
│   │       └── schema.prisma
│   │
│   └── indexer/                  # Event indexer service
│       ├── src/
│       │   ├── index.ts
│       │   ├── chains.ts
│       │   ├── processors/
│       │   └── sync.ts
│       └── package.json
│
├── packages/
│   ├── contracts/                # Solidity smart contracts
│   │   ├── src/
│   │   │   ├── P2POrderbook.sol
│   │   │   ├── P2PEscrowHTLC.sol
│   │   │   └── interfaces/
│   │   ├── test/
│   │   ├── script/
│   │   └── foundry.toml
│   │
│   └── shared/                   # Shared types & ABIs
│       ├── src/
│       │   ├── types.ts
│       │   ├── constants.ts
│       │   └── abis/
│       └── package.json
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

## Data Flow

### 1. Order Creation
```
User → Frontend → wagmi/viem → Chain A Orderbook.createOrder()
                                      ↓
                               OrderCreated event
                                      ↓
                            Indexer picks up event
                                      ↓
                            Store in Postgres
```

### 2. Maker Lock
```
User → Frontend → wagmi/viem → Token.approve() → Chain A Escrow.lockMaker()
                                                        ↓
                                                 MakerLocked event
                                                        ↓
                                              Indexer updates order
```

### 3. Taker Lock
```
Taker → Frontend → API (GET /orders) → Browse available orders
                         ↓
Taker → Frontend → wagmi/viem → Chain B Escrow.lockTaker()
                                       ↓
                                TakerLocked event
```

### 4. Claim Flow
```
Maker → Chain B Escrow.claim(secret) → Claimed event (secret in calldata)
                                              ↓
                                    Indexer extracts secret
                                              ↓
Taker → API → Get secret → Chain A Escrow.claim(secret)
```

## Security Model

### Trust Assumptions
- **Zero custody**: Backend never holds private keys or funds
- **Trustless execution**: All swaps enforced by smart contracts
- **Atomicity**: Either both parties receive funds, or both refund
- **Time-bound**: Timelocks ensure funds are never stuck forever

### Contract Security
- Reentrancy guards on all external calls
- Checks-effects-interactions pattern
- SafeERC20 for token transfers
- Strict state machine (no invalid transitions)
- Custom errors for gas efficiency
- Events for all state changes
- Optional pausable pattern for emergencies

### Timelock Safety
- T1 (maker) > T2 (taker) ensures maker can always claim first
- Recommended: T1 = 24h, T2 = 12h
- Configurable per order based on chain finality needs

## Database Schema Overview

### Core Tables
- **orders**: Main order records with status tracking
- **escrows**: Lock state per chain (maker/taker sides)
- **events**: Raw indexed events with reorg tolerance
- **chain_configs**: Per-chain contract addresses and settings

### Indexes
- status + chainId for filtering
- makerAddress for user lookups
- hashLock for cross-chain correlation
- blockNumber for reorg handling

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/orders | List orders with filters |
| GET | /api/orders/:id | Single order details |
| GET | /api/orders/:id/timeline | Order state timeline |
| GET | /api/health | Service health check |

## Environment Configuration

```env
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Chain A (e.g., Sepolia)
CHAIN_A_RPC_URL=https://...
CHAIN_A_CHAIN_ID=11155111
CHAIN_A_ORDERBOOK_ADDRESS=0x...
CHAIN_A_ESCROW_ADDRESS=0x...

# Chain B (e.g., Base Sepolia)
CHAIN_B_RPC_URL=https://...
CHAIN_B_CHAIN_ID=84532
CHAIN_B_ORDERBOOK_ADDRESS=0x...
CHAIN_B_ESCROW_ADDRESS=0x...

# Indexer
INDEXER_START_BLOCK_A=0
INDEXER_START_BLOCK_B=0
INDEXER_POLL_INTERVAL=12000
REORG_TOLERANCE_BLOCKS=64
```

## Deployment Checklist

1. Deploy contracts to Chain A and Chain B
2. Configure environment variables
3. Run Prisma migrations
4. Start indexer service
5. Start Next.js application
6. Seed demo data (optional)

