// =============================================================================
// P2P Exchange - Wagmi Configuration
// ONLY BSC Chain + DSC Chain
// =============================================================================

import { http } from 'wagmi';
import { type Chain } from 'viem';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { APP_CONFIG } from './config';

// =============================================================================
// BSC Chain (Chain A) - ID: 56
// =============================================================================
const bscChain: Chain = {
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: {
      http: ['https://bsc-dataseed1.binance.org'],
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
};

// =============================================================================
// DSC Chain (Chain B) - ID: 1555
// =============================================================================
const dscChain: Chain = {
  id: 1555,
  name: 'DSC Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'DSC',
    symbol: 'DSC',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc01.dscscan.io/'],
    },
  },
  blockExplorers: {
    default: { name: 'DSCScan', url: 'https://dscscan.io' },
  },
};

// Get the project ID
const projectId = APP_CONFIG.walletConnectProjectId || '3a8170812b534d0ff9d794f19a901d64';

// Only BSC and DSC chains - NO SEPOLIA, NO TEST CHAINS
const chains = [bscChain, dscChain] as const;

// RainbowKit + wagmi config - ssr: false to prevent WalletConnect indexedDB errors
export const config = getDefaultConfig({
  appName: APP_CONFIG.name,
  projectId,
  chains: chains,
  ssr: false,
  transports: {
    [bscChain.id]: http('https://bsc-dataseed1.binance.org'),
    [dscChain.id]: http('https://rpc01.dscscan.io/'),
  },
});

export { bscChain, dscChain };
export const supportedChains = chains;

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
