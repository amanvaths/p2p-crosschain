// =============================================================================
// P2P Exchange Indexer - Chain Clients
// =============================================================================

import { createPublicClient, http, type PublicClient, type Chain } from 'viem';
import { bsc, sepolia, baseSepolia } from 'viem/chains';
import { config, type ChainConfig } from './config.js';

// Custom DSC Chain definition
const dscChain: Chain = {
  id: 1555,
  name: 'DSC Chain',
  nativeCurrency: {
    name: 'DSC',
    symbol: 'DSC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc01.dscscan.io/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'DSCScan',
      url: 'https://dscscan.io',
    },
  },
};

const chainById: Record<number, Chain> = {
  56: bsc,
  1555: dscChain,
  11155111: sepolia,
  84532: baseSepolia,
};

export function createChainClient(chainConfig: ChainConfig): PublicClient {
  const chain = chainById[chainConfig.chainId];

  if (!chain) {
    throw new Error(`Unsupported chain: ${chainConfig.chainId}`);
  }

  return createPublicClient({
    chain,
    transport: http(chainConfig.rpcUrl),
    batch: {
      multicall: true,
    },
  });
}

export const chainClients = new Map<number, PublicClient>();

export function initializeChainClients(): void {
  for (const chainConfig of config.chains) {
    const client = createChainClient(chainConfig);
    chainClients.set(chainConfig.chainId, client);
    console.log(`Initialized client for ${chainConfig.name} (${chainConfig.chainId})`);
  }
}

export function getChainClient(chainId: number): PublicClient {
  const client = chainClients.get(chainId);
  if (!client) {
    throw new Error(`No client for chain ${chainId}`);
  }
  return client;
}

export default chainClients;

