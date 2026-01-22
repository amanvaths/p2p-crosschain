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
    maxBlocksPerQuery: Number(process.env.MAX_BLOCKS_PER_QUERY || '2000'),
    defaultPollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS || '12000'),
  },

  chains: [
    {
      chainId: 11155111,
      name: 'Sepolia',
      rpcUrl: process.env.CHAIN_A_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
      orderbookAddress: (process.env.CHAIN_A_ORDERBOOK_ADDRESS || '0x0000000000000000000000000000000000000000') as Address,
      escrowAddress: (process.env.CHAIN_A_ESCROW_ADDRESS || '0x0000000000000000000000000000000000000000') as Address,
      startBlock: BigInt(process.env.INDEXER_START_BLOCK_A || '0'),
      pollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS || '12000'),
      confirmations: 2,
    },
    {
      chainId: 84532,
      name: 'Base Sepolia',
      rpcUrl: process.env.CHAIN_B_RPC_URL || 'https://base-sepolia.g.alchemy.com/v2/demo',
      orderbookAddress: (process.env.CHAIN_B_ORDERBOOK_ADDRESS || '0x0000000000000000000000000000000000000000') as Address,
      escrowAddress: (process.env.CHAIN_B_ESCROW_ADDRESS || '0x0000000000000000000000000000000000000000') as Address,
      startBlock: BigInt(process.env.INDEXER_START_BLOCK_B || '0'),
      pollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS || '12000'),
      confirmations: 2,
    },
  ] as ChainConfig[],
};

export default config;

