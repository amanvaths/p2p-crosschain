// =============================================================================
// P2P Atomic Exchange - Contract ABIs
// =============================================================================

export const P2POrderbookABI = [
  // Events
  {
    type: 'event',
    name: 'OrderCreated',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'sellToken', type: 'address', indexed: false },
      { name: 'sellAmount', type: 'uint256', indexed: false },
      { name: 'buyToken', type: 'address', indexed: false },
      { name: 'buyAmount', type: 'uint256', indexed: false },
      { name: 'srcChainId', type: 'uint256', indexed: false },
      { name: 'dstChainId', type: 'uint256', indexed: false },
      { name: 'hashLock', type: 'bytes32', indexed: false },
      { name: 'makerTimelock', type: 'uint256', indexed: false },
      { name: 'takerTimelock', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
    ],
  },

  // Errors
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidTimelock', inputs: [] },
  { type: 'error', name: 'InvalidHashLock', inputs: [] },
  { type: 'error', name: 'OrderNotFound', inputs: [] },
  { type: 'error', name: 'NotOrderMaker', inputs: [] },
  { type: 'error', name: 'OrderAlreadyCancelled', inputs: [] },

  // Read Functions
  {
    type: 'function',
    name: 'orders',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'maker', type: 'address' },
      { name: 'sellToken', type: 'address' },
      { name: 'sellAmount', type: 'uint256' },
      { name: 'buyToken', type: 'address' },
      { name: 'buyAmount', type: 'uint256' },
      { name: 'srcChainId', type: 'uint256' },
      { name: 'dstChainId', type: 'uint256' },
      { name: 'hashLock', type: 'bytes32' },
      { name: 'makerTimelock', type: 'uint256' },
      { name: 'takerTimelock', type: 'uint256' },
      { name: 'cancelled', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'orderCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },

  // Write Functions
  {
    type: 'function',
    name: 'createOrder',
    inputs: [
      { name: 'sellToken', type: 'address' },
      { name: 'sellAmount', type: 'uint256' },
      { name: 'buyToken', type: 'address' },
      { name: 'buyAmount', type: 'uint256' },
      { name: 'dstChainId', type: 'uint256' },
      { name: 'hashLock', type: 'bytes32' },
      { name: 'makerTimelock', type: 'uint256' },
      { name: 'takerTimelock', type: 'uint256' },
    ],
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
] as const;

export const P2PEscrowHTLCABI = [
  // Events
  {
    type: 'event',
    name: 'Locked',
    inputs: [
      { name: 'lockId', type: 'bytes32', indexed: true },
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'hashLock', type: 'bytes32', indexed: false },
      { name: 'timelock', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'lockId', type: 'bytes32', indexed: true },
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'hashLock', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Refunded',
    inputs: [
      { name: 'lockId', type: 'bytes32', indexed: true },
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'hashLock', type: 'bytes32', indexed: false },
    ],
  },

  // Errors
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidTimelock', inputs: [] },
  { type: 'error', name: 'InvalidHashLock', inputs: [] },
  { type: 'error', name: 'InvalidSecret', inputs: [] },
  { type: 'error', name: 'LockNotFound', inputs: [] },
  { type: 'error', name: 'LockAlreadyExists', inputs: [] },
  { type: 'error', name: 'NotDepositor', inputs: [] },
  { type: 'error', name: 'NotRecipient', inputs: [] },
  { type: 'error', name: 'TimelockNotExpired', inputs: [] },
  { type: 'error', name: 'TimelockExpired', inputs: [] },
  { type: 'error', name: 'AlreadyClaimed', inputs: [] },
  { type: 'error', name: 'AlreadyRefunded', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },

  // Read Functions
  {
    type: 'function',
    name: 'locks',
    inputs: [{ name: 'lockId', type: 'bytes32' }],
    outputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'depositor', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'hashLock', type: 'bytes32' },
      { name: 'timelock', type: 'uint256' },
      { name: 'claimed', type: 'bool' },
      { name: 'refunded', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLockId',
    inputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'depositor', type: 'address' },
      { name: 'hashLock', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'computeHashLock',
    inputs: [{ name: 'secret', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
  },

  // Write Functions
  {
    type: 'function',
    name: 'lock',
    inputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'hashLock', type: 'bytes32' },
      { name: 'timelock', type: 'uint256' },
    ],
    outputs: [{ name: 'lockId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [
      { name: 'lockId', type: 'bytes32' },
      { name: 'secret', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refund',
    inputs: [{ name: 'lockId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// =============================================================================
// P2PVaultBSC ABI (Buy Orders)
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
] as const;

// =============================================================================
// P2PVaultDSC ABI (Sell Orders / Fill Orders)
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
] as const;

// Standard ERC20 ABI (minimal for approve/transfer)
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
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;
