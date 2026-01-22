// =============================================================================
// P2P Exchange - Configuration
// =============================================================================

import type { Address } from 'viem';
import { sepolia, baseSepolia } from 'viem/chains';
import type { ChainConfig } from '@p2p/shared';

// -----------------------------------------------------------------------------
// Chain Configurations
// -----------------------------------------------------------------------------

export const SUPPORTED_CHAINS = [sepolia, baseSepolia] as const;

export const CHAIN_A = {
  ...sepolia,
  orderbookAddress: (process.env.NEXT_PUBLIC_CHAIN_A_ORDERBOOK_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as Address,
  escrowAddress: (process.env.NEXT_PUBLIC_CHAIN_A_ESCROW_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as Address,
  blockExplorer:
    process.env.NEXT_PUBLIC_CHAIN_A_BLOCK_EXPLORER || 'https://sepolia.etherscan.io',
};

export const CHAIN_B = {
  ...baseSepolia,
  orderbookAddress: (process.env.NEXT_PUBLIC_CHAIN_B_ORDERBOOK_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as Address,
  escrowAddress: (process.env.NEXT_PUBLIC_CHAIN_B_ESCROW_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as Address,
  blockExplorer:
    process.env.NEXT_PUBLIC_CHAIN_B_BLOCK_EXPLORER || 'https://sepolia.basescan.org',
};

export const CHAIN_CONFIGS: Record<number, typeof CHAIN_A> = {
  [sepolia.id]: CHAIN_A,
  [baseSepolia.id]: CHAIN_B,
};

export function getChainConfig(chainId: number) {
  return CHAIN_CONFIGS[chainId];
}

export function getContractAddress(
  chainId: number,
  contract: 'orderbook' | 'escrow'
): Address {
  const config = getChainConfig(chainId);
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);
  return contract === 'orderbook' ? config.orderbookAddress : config.escrowAddress;
}

// -----------------------------------------------------------------------------
// Default Timelocks
// -----------------------------------------------------------------------------

export const DEFAULT_MAKER_TIMELOCK = BigInt(
  process.env.NEXT_PUBLIC_DEFAULT_MAKER_TIMELOCK || '86400' // 24 hours
);

export const DEFAULT_TAKER_TIMELOCK = BigInt(
  process.env.NEXT_PUBLIC_DEFAULT_TAKER_TIMELOCK || '43200' // 12 hours
);

// -----------------------------------------------------------------------------
// Test Tokens (for demo)
// -----------------------------------------------------------------------------

export interface TokenConfig {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export const TOKENS: Record<number, TokenConfig[]> = {
  [sepolia.id]: [
    {
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    {
      address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
  ],
  [baseSepolia.id]: [
    {
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
  ],
};

export function getTokens(chainId: number): TokenConfig[] {
  return TOKENS[chainId] || [];
}

export function getToken(
  chainId: number,
  addressOrSymbol: string
): TokenConfig | undefined {
  const tokens = getTokens(chainId);
  return tokens.find(
    (t) =>
      t.address.toLowerCase() === addressOrSymbol.toLowerCase() ||
      t.symbol.toLowerCase() === addressOrSymbol.toLowerCase()
  );
}

// -----------------------------------------------------------------------------
// App Config
// -----------------------------------------------------------------------------

export const APP_CONFIG = {
  name: 'P2P Atomic Exchange',
  description: 'Non-custodial cross-chain atomic swaps using HTLC',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
};

