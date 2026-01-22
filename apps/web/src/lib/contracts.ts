// =============================================================================
// P2P Exchange - Contract Configuration & ABIs
// =============================================================================

import type { Address } from 'viem';

// =============================================================================
// Chain IDs
// =============================================================================

export const BSC_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_A_ID) || 56;
export const DSC_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_B_ID) || 1555;

// =============================================================================
// Contract Addresses by Chain
// =============================================================================

export interface ContractAddresses {
  vault: Address;
  usdt: Address;
  bridgeRelayer: Address;
}

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  // BSC Chain
  [BSC_CHAIN_ID]: {
    vault: (process.env.NEXT_PUBLIC_CHAIN_A_VAULT_CONTRACT || '0x0000000000000000000000000000000000000000') as Address,
    usdt: (process.env.NEXT_PUBLIC_CHAIN_A_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955') as Address,
    bridgeRelayer: (process.env.NEXT_PUBLIC_BRIDGE_RELAYER || '0x0000000000000000000000000000000000000000') as Address,
  },
  // DSC Chain
  [DSC_CHAIN_ID]: {
    vault: (process.env.NEXT_PUBLIC_CHAIN_B_VAULT_CONTRACT || '0x0000000000000000000000000000000000000000') as Address,
    usdt: (process.env.NEXT_PUBLIC_CHAIN_B_USDT_CONTRACT || '0xbc27aCEac6865dE31a286Cd9057564393D5251CB') as Address,
    bridgeRelayer: (process.env.NEXT_PUBLIC_BRIDGE_RELAYER || '0x0000000000000000000000000000000000000000') as Address,
  },
};

// Helper to get contract address
export function getContractAddress(chainId: number, contract: keyof ContractAddresses): Address {
  const addresses = CONTRACT_ADDRESSES[chainId];
  if (!addresses) {
    throw new Error(`No contract addresses for chain ${chainId}`);
  }
  return addresses[contract];
}

// =============================================================================
// P2PVaultBSC ABI
// =============================================================================

export const P2PVaultBSCABI = [
  // Events
  {
    type: 'event',
    name: 'OrderCreated',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'expiresAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderMatched',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCompleted',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'dscTxHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderRefunded',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  // Read Functions
  {
    type: 'function',
    name: 'USDT',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOrder',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'buyer', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'matchedSeller', type: 'address' },
      { name: 'matchedAt', type: 'uint256' },
      { name: 'dscTxHash', type: 'bytes32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOrderCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserOrderIds',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserLockedAmount',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOpenOrders',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      { name: 'orderIds', type: 'uint256[]' },
      { name: 'buyers', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'expiresAts', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalLocked',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'orderExpiryTime',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  // Write Functions
  {
    type: 'function',
    name: 'createBuyOrder',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'orderId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancelOrder',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refundExpiredOrder',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Bridge Relayer Functions
  {
    type: 'function',
    name: 'matchOrder',
    inputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'seller', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'completeOrder',
    inputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'dscTxHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// =============================================================================
// P2PVaultDSC ABI
// =============================================================================

export const P2PVaultDSCABI = [
  // Events
  {
    type: 'event',
    name: 'SellOrderCreated',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'expiresAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectFillCreated',
    inputs: [
      { name: 'dscOrderId', type: 'uint256', indexed: true },
      { name: 'bscOrderId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'buyer', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderMatched',
    inputs: [
      { name: 'dscOrderId', type: 'uint256', indexed: true },
      { name: 'bscOrderId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'buyer', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCompleted',
    inputs: [
      { name: 'dscOrderId', type: 'uint256', indexed: true },
      { name: 'bscOrderId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: false },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'bscTxHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  // Read Functions
  {
    type: 'function',
    name: 'DEP20_USDT',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOrder',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'seller', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'orderType', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'matchedBuyer', type: 'address' },
      { name: 'matchedBscOrderId', type: 'uint256' },
      { name: 'matchedAt', type: 'uint256' },
      { name: 'bscTxHash', type: 'bytes32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOrderCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserOrderIds',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isBscOrderMatched',
    inputs: [{ name: 'bscOrderId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDscOrderForBscOrder',
    inputs: [{ name: 'bscOrderId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOpenSellOrders',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      { name: 'orderIds', type: 'uint256[]' },
      { name: 'sellers', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'expiresAts', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalLocked',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  // Write Functions
  {
    type: 'function',
    name: 'createSellOrder',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'orderId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'fillBscBuyOrder',
    inputs: [
      { name: 'bscOrderId', type: 'uint256' },
      { name: 'buyer', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancelSellOrder',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refundExpiredOrder',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// =============================================================================
// ERC20 ABI (for token approvals)
// =============================================================================

export const ERC20ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

// =============================================================================
// Order Status Enum (matches contract)
// =============================================================================

export enum OrderStatus {
  NONE = 0,
  OPEN = 1,
  MATCHED = 2,
  COMPLETED = 3,
  CANCELLED = 4,
  EXPIRED = 5,
  REFUNDED = 6,
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.NONE]: 'None',
  [OrderStatus.OPEN]: 'Open',
  [OrderStatus.MATCHED]: 'Matched',
  [OrderStatus.COMPLETED]: 'Completed',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.EXPIRED]: 'Expired',
  [OrderStatus.REFUNDED]: 'Refunded',
};

// =============================================================================
// EIP-712 Domain and Types for Order Signing
// =============================================================================

export const EIP712_DOMAIN = {
  name: 'P2P-CrossChain-Order',
  version: '1',
} as const;

export const ORDER_TYPEHASH = {
  P2POrder: [
    { name: 'orderId', type: 'uint256' },
    { name: 'buyerBsc', type: 'address' },
    { name: 'buyerDscReceiver', type: 'address' },
    { name: 'depAmount', type: 'uint256' },
    { name: 'usdtAmount', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'srcChainId', type: 'uint256' },
    { name: 'dstChainId', type: 'uint256' },
  ],
} as const;

export interface P2POrderData {
  orderId: bigint;
  buyerBsc: Address;
  buyerDscReceiver: Address;
  depAmount: bigint;
  usdtAmount: bigint;
  expiry: bigint;
  srcChainId: bigint;
  dstChainId: bigint;
}

