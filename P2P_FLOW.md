# P2P Cross-Chain Exchange Flow

## Overview

This P2P exchange allows users to swap between **BEP20 USDT (BSC)** and **DEP20 USDT (DSC)** at a fixed 1:1 rate.

---

## Smart Contracts

| Chain | Contract | Token | Purpose |
|-------|----------|-------|---------|
| **BSC (56)** | P2PVaultBSC | BEP20 USDT | Lock USDT when buying DEP20 |
| **DSC (1555)** | P2PVaultDSC | DEP20 USDT | Lock DEP20 when selling |

---

## Flow 1: BUY DEP20 (User A creates buy order)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BUY DEP20 FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

User A wants to BUY 100 DEP20 USDT

Step 1: CREATE ORDER (BSC Chain)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   User A ──────────────────────► P2PVaultBSC                                │
│            100 BEP20 USDT        (Contract locks USDT)                      │
│                                                                              │
│   Order Created: ID #1, Status: OPEN                                        │
│   Waiting for seller...                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 2: SELLER FILLS ORDER (DSC Chain)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   User B (Seller) sees Order #1 in the list                                 │
│                                                                              │
│   User B ──────────────────────► P2PVaultDSC                                │
│            100 DEP20 USDT        (Contract locks DEP20)                     │
│                                                                              │
│   Calls: fillBscBuyOrder(orderId=1, buyer=UserA, amount=100)                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 3: BRIDGE RELAYER CONFIRMS (Both Chains)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Bridge Relayer detects:                                                   │
│   - BSC: Order #1 OPEN with 100 USDT locked                                 │
│   - DSC: User B locked 100 DEP20 for Order #1                               │
│                                                                              │
│   Relayer Actions:                                                          │
│   1. BSC: matchOrder(1, UserB) → Status: MATCHED                            │
│   2. BSC: completeOrder(1, UserB, dscTxHash) → Release USDT to User B       │
│   3. DSC: completeDirectFill(dscOrderId, bscTxHash) → Release DEP20 to A    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 4: COMPLETED
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ✅ User A: Receives 100 DEP20 USDT (DSC Chain)                            │
│   ✅ User B: Receives 100 BEP20 USDT (BSC Chain)                            │
│                                                                              │
│   Order #1 Status: COMPLETED                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 2: SELL DEP20 (User B creates sell order)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SELL DEP20 FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

User B wants to SELL 50 DEP20 USDT for BEP20 USDT

Step 1: CREATE SELL ORDER (DSC Chain)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   User B ──────────────────────► P2PVaultDSC                                │
│            50 DEP20 USDT         (Contract locks DEP20)                     │
│                                                                              │
│   Sell Order Created: ID #5, Status: OPEN                                   │
│   Waiting for buyer...                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 2: BUYER FILLS ORDER (BSC Chain)
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   User A (Buyer) sees Sell Order #5 in the list                             │
│                                                                              │
│   User A ──────────────────────► P2PVaultBSC                                │
│            50 BEP20 USDT         (Contract locks USDT)                      │
│                                                                              │
│   Calls: createBuyOrder(50) with reference to DSC Order #5                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 3: BRIDGE RELAYER CONFIRMS
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Bridge Relayer matches the orders and completes swap                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 4: COMPLETED
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ✅ User A: Receives 50 DEP20 USDT (DSC Chain)                             │
│   ✅ User B: Receives 50 BEP20 USDT (BSC Chain)                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## UI Order Flow

### BUY Tab (User wants to buy DEP20)
Shows: Sell orders from DSC chain (DEP20 available for purchase)
Action: Click "BUY" → Lock BEP20 USDT on BSC → Receive DEP20 on DSC

### SELL Tab (User wants to sell DEP20)
Shows: Buy orders from BSC chain (USDT available for purchase)
Action: Click "SELL" → Lock DEP20 on DSC → Receive BEP20 USDT on BSC

---

## Security Features

1. **Escrow Locking**: Funds are locked in smart contracts until swap completes
2. **Time Expiry**: Orders expire after 24 hours, funds auto-refund
3. **Bridge Relayer**: Only authorized relayer can complete swaps
4. **Pausable**: Admin can pause contracts in emergency
5. **No Rug Pull**: Admin cannot withdraw user locked funds

---

## Token Addresses

| Token | Chain | Address |
|-------|-------|---------|
| BEP20 USDT | BSC (56) | `0x55d398326f99059fF775485246999027B3197955` |
| DEP20 USDT | DSC (1555) | `0xbc27aCEac6865dE31a286Cd9057564393D5251CB` |

---

## Contract Functions

### P2PVaultBSC (BSC Chain)

| Function | Who Calls | Description |
|----------|-----------|-------------|
| `createBuyOrder(amount)` | User | Lock USDT, create buy order |
| `cancelOrder(orderId)` | User | Cancel order, get refund |
| `matchOrder(orderId, seller)` | Relayer | Mark order as matched |
| `completeOrder(orderId, seller, txHash)` | Relayer | Release USDT to seller |

### P2PVaultDSC (DSC Chain)

| Function | Who Calls | Description |
|----------|-----------|-------------|
| `createSellOrder(amount)` | User | Lock DEP20, create sell order |
| `cancelSellOrder(orderId)` | User | Cancel order, get refund |
| `fillBscBuyOrder(bscOrderId, buyer, amount)` | User | Fill existing BSC buy order |
| `completeOrder(orderId, buyer, txHash)` | Relayer | Release DEP20 to buyer |

