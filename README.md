# P2P Cross-Chain Atomic Exchange

Enterprise-grade peer-to-peer cross-chain atomic swap system using Hash Time-Locked Contracts (HTLC). This system is **non-custodial** and **trust-minimized**: the backend only indexes and coordinates, while funds are secured exclusively in smart contracts.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js)                             │
│                    Browse Orders | Create Order | Order Details             │
│                         RainbowKit + wagmi v2 + viem                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
         ┌──────────────┐    ┌─────────────┐    ┌─────────────────┐
         │   Chain A    │    │   Backend   │    │    Chain B      │
         │  (Sepolia)   │    │   Indexer   │    │  (Base Sepolia) │
         │              │    │   + API     │    │                 │
         │ • Orderbook  │    │             │    │ • Orderbook     │
         │ • Escrow     │    │ • Postgres  │    │ • Escrow        │
         │   HTLC       │    │ • Redis     │    │   HTLC          │
         └──────────────┘    └─────────────┘    └─────────────────┘
```

## 🔄 Atomic Swap Flow

1. **Maker** generates secret `S`, computes `H = keccak256(S)`, creates order on Chain A
2. **Maker** locks sell tokens in Chain A escrow with timelock T1 (24h)
3. **Taker** locks buy tokens on Chain B escrow using same H with timelock T2 (12h) < T1
4. **Maker** claims on Chain B by revealing secret S
5. **Taker** reads S from Chain B transaction, claims on Chain A
6. If swap fails, refunds available after timelocks expire

## 📁 Project Structure

```
p2p/
├── apps/
│   ├── web/                # Next.js Frontend + API
│   │   ├── src/
│   │   │   ├── app/        # App Router pages
│   │   │   ├── components/ # React components
│   │   │   ├── hooks/      # Custom wagmi hooks
│   │   │   └── lib/        # Utilities
│   │   └── prisma/         # Database schema
│   │
│   └── indexer/            # Event indexer service
│       └── src/
│           ├── processors/ # Event handlers
│           └── sync.ts     # Block synchronization
│
├── packages/
│   ├── contracts/          # Solidity smart contracts
│   │   ├── src/
│   │   │   ├── P2POrderbook.sol
│   │   │   └── P2PEscrowHTLC.sol
│   │   └── test/
│   │
│   └── shared/             # Shared types & ABIs
│       └── src/
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- PostgreSQL
- Redis
- Foundry (for contracts)

### 1. Clone and Install

```bash
git clone <repository>
cd p2p
pnpm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/p2p_exchange"

# Redis
REDIS_URL="redis://localhost:6379"

# Chain A (Sepolia)
NEXT_PUBLIC_CHAIN_A_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
NEXT_PUBLIC_CHAIN_A_ORDERBOOK_ADDRESS="0x..."
NEXT_PUBLIC_CHAIN_A_ESCROW_ADDRESS="0x..."

# Chain B (Base Sepolia)
NEXT_PUBLIC_CHAIN_B_RPC_URL="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
NEXT_PUBLIC_CHAIN_B_ORDERBOOK_ADDRESS="0x..."
NEXT_PUBLIC_CHAIN_B_ESCROW_ADDRESS="0x..."

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="your_project_id"
```

### 3. Database Setup

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Seed demo data (optional)
pnpm --filter @p2p/web db:seed
```

### 4. Deploy Contracts

```bash
cd packages/contracts

# Install Foundry dependencies
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std

# Build contracts
forge build

# Run tests
forge test -vvv

# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify

# Deploy to Base Sepolia
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

### 5. Start Services

```bash
# Start Next.js development server
pnpm dev

# In another terminal, start the indexer
pnpm indexer:start
```

Access the app at `http://localhost:3000`

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders with filters |
| GET | `/api/orders/:id` | Single order details |
| GET | `/api/orders/:id/timeline` | Order event timeline |
| GET | `/api/health` | Service health check |

### Query Parameters

- `status`: Filter by order status (OPEN, MAKER_LOCKED, TAKER_LOCKED, COMPLETED, etc.)
- `maker`: Filter by maker address
- `srcChainId`: Filter by source chain
- `dstChainId`: Filter by destination chain
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

## 🔐 Smart Contracts

### P2POrderbook

Stores maker intent for P2P swaps:
- `createOrder()`: Create a new swap order
- `cancelOrder()`: Cancel an unfilled order
- Emits: `OrderCreated`, `OrderCancelled`

### P2PEscrowHTLC

Hash Time-Locked Contract for secure token escrow:
- `lock()`: Lock tokens with hash lock and timelock
- `claim(secret)`: Claim tokens by revealing the secret
- `refund()`: Refund after timelock expires
- Emits: `Locked`, `Claimed`, `Refunded`

### Security Features
- Reentrancy guards
- Checks-effects-interactions pattern
- SafeERC20 transfers
- Custom errors for gas efficiency
- Pausable admin functions
- Strict state machine

## 🧪 Testing

```bash
# Contract tests
pnpm contracts:test

# Run with coverage
cd packages/contracts && forge coverage
```

## 🛠️ Development

### Running in Development

```bash
# All services
pnpm dev

# Just web
pnpm --filter @p2p/web dev

# Just indexer
pnpm --filter @p2p/indexer dev
```

### Building for Production

```bash
pnpm build
```

### Linting

```bash
pnpm lint
```

## 🔒 Security Considerations

1. **Non-custodial**: Backend never holds private keys
2. **Trustless**: All swaps enforced by smart contracts
3. **Atomic**: Either both parties receive funds, or both can refund
4. **Time-bound**: Timelocks prevent funds from being stuck
5. **Secret management**: Secrets should never be shared before claiming

### Timelock Safety

- Maker timelock (T1) > Taker timelock (T2)
- Recommended: T1 = 24h, T2 = 12h
- This ensures maker can always claim first, revealing the secret for taker

## 📜 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

---

Built with ❤️ using Next.js, wagmi, viem, and Foundry

