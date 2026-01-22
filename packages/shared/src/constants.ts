// =============================================================================
// P2P Atomic Exchange - Constants
// =============================================================================

import type { Address } from 'viem';

// -----------------------------------------------------------------------------
// Time Constants
// -----------------------------------------------------------------------------

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;

// Default timelocks
export const DEFAULT_MAKER_TIMELOCK = BigInt(SECONDS_PER_DAY); // 24 hours
export const DEFAULT_TAKER_TIMELOCK = BigInt(SECONDS_PER_DAY / 2); // 12 hours

// Minimum timelock (1 hour)
export const MIN_TIMELOCK = BigInt(SECONDS_PER_HOUR);

// -----------------------------------------------------------------------------
// Chain IDs
// -----------------------------------------------------------------------------

export const CHAIN_IDS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  // Add more chains as needed
} as const;

// -----------------------------------------------------------------------------
// Contract Addresses (placeholder - replace with actual deployed addresses)
// -----------------------------------------------------------------------------

export const CONTRACT_ADDRESSES: Record<
  number,
  { orderbook: Address; escrow: Address }
> = {
  [CHAIN_IDS.SEPOLIA]: {
    orderbook: '0x0000000000000000000000000000000000000000' as Address,
    escrow: '0x0000000000000000000000000000000000000000' as Address,
  },
  [CHAIN_IDS.BASE_SEPOLIA]: {
    orderbook: '0x0000000000000000000000000000000000000000' as Address,
    escrow: '0x0000000000000000000000000000000000000000' as Address,
  },
};

// -----------------------------------------------------------------------------
// Test Tokens (for testnet usage)
// -----------------------------------------------------------------------------

export const TEST_TOKENS: Record<number, { usdc: Address; weth: Address }> = {
  [CHAIN_IDS.SEPOLIA]: {
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address, // Sepolia USDC
    weth: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as Address, // Sepolia WETH
  },
  [CHAIN_IDS.BASE_SEPOLIA]: {
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address, // Base Sepolia USDC
    weth: '0x4200000000000000000000000000000000000006' as Address, // Base Sepolia WETH
  },
};

// -----------------------------------------------------------------------------
// Indexer Constants
// -----------------------------------------------------------------------------

export const DEFAULT_POLL_INTERVAL_MS = 12000; // 12 seconds
export const REORG_TOLERANCE_BLOCKS = 64;
export const MAX_BLOCKS_PER_QUERY = 2000;

// -----------------------------------------------------------------------------
// API Constants
// -----------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 100;

// -----------------------------------------------------------------------------
// Validation Constants
// -----------------------------------------------------------------------------

export const MIN_ORDER_AMOUNT = BigInt(1); // Minimum 1 wei
export const HASH_LOCK_LENGTH = 66; // 0x + 64 hex chars
export const SECRET_LENGTH = 66; // 0x + 64 hex chars

// -----------------------------------------------------------------------------
// Event Names
// -----------------------------------------------------------------------------

export const ORDERBOOK_EVENTS = {
  ORDER_CREATED: 'OrderCreated',
  ORDER_CANCELLED: 'OrderCancelled',
} as const;

export const ESCROW_EVENTS = {
  LOCKED: 'Locked',
  CLAIMED: 'Claimed',
  REFUNDED: 'Refunded',
} as const;

