// =============================================================================
// P2P Atomic Exchange - Shared Types
// =============================================================================

import type { Address, Hash, Hex } from 'viem';

// -----------------------------------------------------------------------------
// Order Types
// -----------------------------------------------------------------------------

export enum OrderStatus {
  OPEN = 'OPEN',
  MAKER_LOCKED = 'MAKER_LOCKED',
  TAKER_LOCKED = 'TAKER_LOCKED',
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum EscrowStatus {
  NONE = 'NONE',
  LOCKED = 'LOCKED',
  CLAIMED = 'CLAIMED',
  REFUNDED = 'REFUNDED',
}

export interface Order {
  id: string;
  orderId: bigint;
  maker: Address;
  sellToken: Address;
  sellAmount: bigint;
  buyToken: Address;
  buyAmount: bigint;
  srcChainId: number;
  dstChainId: number;
  hashLock: Hash;
  makerTimelock: bigint;
  takerTimelock: bigint;
  status: OrderStatus;
  txHash?: Hash;
  secret?: Hex;
  createdAt: Date;
  updatedAt: Date;
}

export interface Escrow {
  id: string;
  orderId: string;
  chainId: number;
  depositor: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  hashLock: Hash;
  timelock: bigint;
  status: EscrowStatus;
  secret?: Hex;
  txHash: Hash;
  blockNumber: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderWithEscrows extends Order {
  makerEscrow?: Escrow;
  takerEscrow?: Escrow;
}

// -----------------------------------------------------------------------------
// Event Types (for indexer)
// -----------------------------------------------------------------------------

export interface IndexedEvent {
  id: string;
  chainId: number;
  contractAddress: Address;
  eventName: string;
  txHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  args: Record<string, unknown>;
  processedAt: Date;
}

export interface OrderCreatedEventArgs {
  orderId: bigint;
  maker: Address;
  sellToken: Address;
  sellAmount: bigint;
  buyToken: Address;
  buyAmount: bigint;
  srcChainId: bigint;
  dstChainId: bigint;
  hashLock: Hash;
  makerTimelock: bigint;
  takerTimelock: bigint;
}

export interface OrderCancelledEventArgs {
  orderId: bigint;
  maker: Address;
}

export interface LockedEventArgs {
  orderId: bigint;
  depositor: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  hashLock: Hash;
  timelock: bigint;
}

export interface ClaimedEventArgs {
  orderId: bigint;
  recipient: Address;
  hashLock: Hash;
}

export interface RefundedEventArgs {
  orderId: bigint;
  depositor: Address;
  hashLock: Hash;
}

// -----------------------------------------------------------------------------
// API Types
// -----------------------------------------------------------------------------

export interface OrdersQueryParams {
  status?: OrderStatus;
  maker?: Address;
  srcChainId?: number;
  dstChainId?: number;
  page?: number;
  limit?: number;
}

export interface OrdersResponse {
  orders: OrderWithEscrows[];
  total: number;
  page: number;
  limit: number;
}

export interface OrderTimelineEntry {
  timestamp: Date;
  event: string;
  chainId: number;
  txHash: Hash;
  details: Record<string, unknown>;
}

export interface OrderTimelineResponse {
  orderId: string;
  timeline: OrderTimelineEntry[];
}

// -----------------------------------------------------------------------------
// Chain Configuration
// -----------------------------------------------------------------------------

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  orderbookAddress: Address;
  escrowAddress: Address;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
}

// -----------------------------------------------------------------------------
// Transaction Types
// -----------------------------------------------------------------------------

export interface CreateOrderParams {
  sellToken: Address;
  sellAmount: bigint;
  buyToken: Address;
  buyAmount: bigint;
  dstChainId: number;
  hashLock: Hash;
  makerTimelock: bigint;
  takerTimelock: bigint;
}

export interface LockParams {
  orderId: bigint;
  recipient: Address;
  token: Address;
  amount: bigint;
  hashLock: Hash;
  timelock: bigint;
}

export interface ClaimParams {
  orderId: bigint;
  secret: Hex;
}

export interface RefundParams {
  orderId: bigint;
}

// -----------------------------------------------------------------------------
// UI State Types
// -----------------------------------------------------------------------------

export interface SwapStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  txHash?: Hash;
  chainId?: number;
}

export type SwapRole = 'maker' | 'taker';

