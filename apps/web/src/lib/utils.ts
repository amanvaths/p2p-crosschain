// =============================================================================
// P2P Exchange - Utilities
// =============================================================================

import { type ClassValue, clsx } from 'clsx';
import { keccak256, encodePacked, type Hash, type Hex } from 'viem';

// -----------------------------------------------------------------------------
// Class Names
// -----------------------------------------------------------------------------

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

// -----------------------------------------------------------------------------
// HTLC Secret Generation
// -----------------------------------------------------------------------------

/**
 * Generates a cryptographically secure random secret
 * @returns The secret as a bytes32 hex string
 */
export function generateSecret(): Hex {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `0x${Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
}

/**
 * Computes the hash lock from a secret
 * @param secret The secret value (bytes32)
 * @returns The keccak256 hash of the secret
 */
export function computeHashLock(secret: Hex): Hash {
  return keccak256(encodePacked(['bytes32'], [secret]));
}

// -----------------------------------------------------------------------------
// Address Formatting
// -----------------------------------------------------------------------------

/**
 * Truncates an address for display
 * @param address The full address
 * @param chars Number of characters to show at start/end (default: 4)
 * @returns Truncated address (e.g., "0x1234...5678")
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// -----------------------------------------------------------------------------
// Amount Formatting
// -----------------------------------------------------------------------------

/**
 * Formats a BigInt amount with decimals
 * @param amount The amount as BigInt or string
 * @param decimals Token decimals
 * @param displayDecimals Number of decimals to display
 * @returns Formatted string
 */
export function formatAmount(
  amount: bigint | string,
  decimals: number,
  displayDecimals: number = 4
): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const divisor = BigInt(10 ** decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const displayFractional = fractionalStr.slice(0, displayDecimals);

  if (displayDecimals === 0 || BigInt(displayFractional) === BigInt(0)) {
    return integerPart.toLocaleString();
  }

  return `${integerPart.toLocaleString()}.${displayFractional}`;
}

/**
 * Parses a decimal string to BigInt with specified decimals
 * @param value The decimal string (e.g., "1.5")
 * @param decimals Token decimals
 * @returns BigInt representation
 */
export function parseAmount(value: string, decimals: number): bigint {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(integerPart + paddedFractional);
}

// -----------------------------------------------------------------------------
// Time Formatting
// -----------------------------------------------------------------------------

/**
 * Formats a Unix timestamp as a countdown string
 * @param timestamp Unix timestamp (seconds)
 * @returns Human-readable countdown (e.g., "2h 30m 15s")
 */
export function formatCountdown(timestamp: number | bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const target = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  const diff = target - now;

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Formats a Unix timestamp as a date string
 * @param timestamp Unix timestamp (seconds)
 * @returns Formatted date string
 */
export function formatTimestamp(timestamp: number | bigint): string {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  return new Date(ts * 1000).toLocaleString();
}

/**
 * Checks if a timelock has expired
 * @param timestamp Unix timestamp (seconds)
 * @returns True if expired
 */
export function isExpired(timestamp: number | bigint): boolean {
  const now = Math.floor(Date.now() / 1000);
  const target = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  return target <= now;
}

// -----------------------------------------------------------------------------
// Order Status
// -----------------------------------------------------------------------------

export function getStatusColor(
  status: string
): 'success' | 'warning' | 'error' | 'muted' {
  switch (status) {
    case 'OPEN':
      return 'success';
    case 'MAKER_LOCKED':
    case 'TAKER_LOCKED':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    case 'REFUNDED':
    case 'CANCELLED':
    case 'EXPIRED':
      return 'muted';
    default:
      return 'muted';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'MAKER_LOCKED':
      return 'Maker Locked';
    case 'TAKER_LOCKED':
      return 'Taker Locked';
    case 'COMPLETED':
      return 'Completed';
    case 'REFUNDED':
      return 'Refunded';
    case 'CANCELLED':
      return 'Cancelled';
    case 'EXPIRED':
      return 'Expired';
    default:
      return status;
  }
}

// -----------------------------------------------------------------------------
// Block Explorer Links
// -----------------------------------------------------------------------------

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    11155111: 'https://sepolia.etherscan.io',
    84532: 'https://sepolia.basescan.org',
  };
  const base = explorers[chainId] || 'https://etherscan.io';
  return `${base}/tx/${txHash}`;
}

export function getExplorerAddressUrl(chainId: number, address: string): string {
  const explorers: Record<number, string> = {
    11155111: 'https://sepolia.etherscan.io',
    84532: 'https://sepolia.basescan.org',
  };
  const base = explorers[chainId] || 'https://etherscan.io';
  return `${base}/address/${address}`;
}

