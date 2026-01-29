// =============================================================================
// P2P Exchange Indexer - Configuration
// =============================================================================

import type { Address } from 'viem';

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  orderbookAddress: Address;
  escrowAddress: Address;
  startBlock: bigint;
  pollIntervalMs: number;
  confirmations: number;
}

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/p2p_exchange',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  indexer: {
    reorgToleranceBlocks: Number(process.env.REORG_TOLERANCE_BLOCKS || '64'),
    maxBlocksPerQuery: Number(process.env.MAX_BLOCKS_PER_QUERY || '5000'), // Ankr supports larger queries
    defaultPollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS || '5000'),
  },

  chains: [
    {
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_A_ID || '56'),
      name: process.env.NEXT_PUBLIC_CHAIN_A_NAME || 'BSC',
      rpcUrl: process.env.NEXT_PUBLIC_CHAIN_A_RPC_URL || 'https://bsc-dataseed1.binance.org',
      orderbookAddress: (process.env.NEXT_PUBLIC_CHAIN_A_VAULT_CONTRACT || '0x7e891720D77546Ef159ef72871EbaAe3896fcc23') as Address,
      escrowAddress: (process.env.NEXT_PUBLIC_CHAIN_A_VAULT_CONTRACT || '0x7e891720D77546Ef159ef72871EbaAe3896fcc23') as Address,
      startBlock: BigInt(process.env.INDEXER_START_BLOCK_A || '76910700'),
      pollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS || '3000'),
      confirmations: 3,
    },
    {
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_B_ID || '1555'),
      name: process.env.NEXT_PUBLIC_CHAIN_B_NAME || 'DSC Chain',
      rpcUrl: process.env.NEXT_PUBLIC_CHAIN_B_RPC_URL || 'https://rpc01.dscscan.io/',
      orderbookAddress: (process.env.NEXT_PUBLIC_CHAIN_B_VAULT_CONTRACT || '0xb4e3Ce07DD861dC10da09Ef7574A07b73470D99d') as Address,
      escrowAddress: (process.env.NEXT_PUBLIC_CHAIN_B_VAULT_CONTRACT || '0xb4e3Ce07DD861dC10da09Ef7574A07b73470D99d') as Address,
      startBlock: BigInt(process.env.INDEXER_START_BLOCK_B || '8774300'),
      pollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS || '5000'),
      confirmations: 3,
    },
  ] as ChainConfig[],
};

export default config;

