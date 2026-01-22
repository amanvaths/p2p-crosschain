// =============================================================================
// P2P Exchange - Chain Configuration
// =============================================================================

export interface ChainConfig {
  id: number;
  name: string;
  network: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  tokens: {
    usdt: {
      address: string;
      symbol: string;
      decimals: number;
    };
    dep20: {
      address: string;
      symbol: string;
      decimals: number;
    };
  };
  contracts: {
    orderbook: string;
    escrow: string;
  };
}

// =============================================================================
// CHAIN A - BSC (Binance Smart Chain) - DEFAULT
// =============================================================================
export const CHAIN_A: ChainConfig = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_A_ID) || 56,
  name: process.env.NEXT_PUBLIC_CHAIN_A_NAME || 'BNB Smart Chain',
  network: process.env.NEXT_PUBLIC_CHAIN_A_NETWORK || 'bsc',
  rpcUrl: process.env.NEXT_PUBLIC_CHAIN_A_RPC_URL || 'https://bsc-dataseed1.binance.org',
  explorerUrl: process.env.NEXT_PUBLIC_CHAIN_A_EXPLORER_URL || 'https://bscscan.com',
  nativeCurrency: {
    name: process.env.NEXT_PUBLIC_CHAIN_A_NATIVE_CURRENCY_NAME || 'BNB',
    symbol: process.env.NEXT_PUBLIC_CHAIN_A_NATIVE_CURRENCY_SYMBOL || 'BNB',
    decimals: Number(process.env.NEXT_PUBLIC_CHAIN_A_NATIVE_CURRENCY_DECIMALS) || 18,
  },
  tokens: {
    usdt: {
      // BEPUSDT - Official Binance-Peg BSC-USD (USDT on BSC)
      address: process.env.NEXT_PUBLIC_CHAIN_A_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955',
      symbol: process.env.NEXT_PUBLIC_CHAIN_A_USDT_SYMBOL || 'USDT',
      decimals: Number(process.env.NEXT_PUBLIC_CHAIN_A_USDT_DECIMALS) || 18,
    },
    dep20: {
      // DEP20 Token - Add your contract address
      address: process.env.NEXT_PUBLIC_CHAIN_A_DEP20_CONTRACT || 'YOUR_DEP20_CONTRACT_ADDRESS_ON_CHAIN_A',
      symbol: process.env.NEXT_PUBLIC_CHAIN_A_DEP20_SYMBOL || 'DEP20',
      decimals: Number(process.env.NEXT_PUBLIC_CHAIN_A_DEP20_DECIMALS) || 18,
    },
  },
  contracts: {
    orderbook: process.env.NEXT_PUBLIC_CHAIN_A_ORDERBOOK_CONTRACT || '',
    escrow: process.env.NEXT_PUBLIC_CHAIN_A_ESCROW_CONTRACT || '',
  },
};

// =============================================================================
// CHAIN B - DSC Chain (ID: 1555)
// =============================================================================
export const CHAIN_B: ChainConfig = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_B_ID) || 1555,
  name: process.env.NEXT_PUBLIC_CHAIN_B_NAME || 'DSC Chain',
  network: process.env.NEXT_PUBLIC_CHAIN_B_NETWORK || 'dsc',
  rpcUrl: process.env.NEXT_PUBLIC_CHAIN_B_RPC_URL || 'https://rpc01.dscscan.io/',
  explorerUrl: process.env.NEXT_PUBLIC_CHAIN_B_EXPLORER_URL || 'https://dscscan.io',
  nativeCurrency: {
    name: process.env.NEXT_PUBLIC_CHAIN_B_NATIVE_CURRENCY_NAME || 'DSC',
    symbol: process.env.NEXT_PUBLIC_CHAIN_B_NATIVE_CURRENCY_SYMBOL || 'DSC',
    decimals: Number(process.env.NEXT_PUBLIC_CHAIN_B_NATIVE_CURRENCY_DECIMALS) || 18,
  },
  tokens: {
    usdt: {
      // DEP20 USDT on DSC Chain
      address: process.env.NEXT_PUBLIC_CHAIN_B_USDT_CONTRACT || '0xbc27aCEac6865dE31a286Cd9057564393D5251CB',
      symbol: process.env.NEXT_PUBLIC_CHAIN_B_USDT_SYMBOL || 'USDT',
      decimals: Number(process.env.NEXT_PUBLIC_CHAIN_B_USDT_DECIMALS) || 18,
    },
    dep20: {
      address: process.env.NEXT_PUBLIC_CHAIN_B_DEP20_CONTRACT || 'YOUR_DEP20_CONTRACT_ADDRESS_ON_DSC',
      symbol: process.env.NEXT_PUBLIC_CHAIN_B_DEP20_SYMBOL || 'DEP20',
      decimals: Number(process.env.NEXT_PUBLIC_CHAIN_B_DEP20_DECIMALS) || 18,
    },
  },
  contracts: {
    orderbook: process.env.NEXT_PUBLIC_CHAIN_B_ORDERBOOK_CONTRACT || '',
    escrow: process.env.NEXT_PUBLIC_CHAIN_B_ESCROW_CONTRACT || '',
  },
};

// =============================================================================
// All Supported Chains
// =============================================================================
export const SUPPORTED_CHAINS = [CHAIN_A, CHAIN_B].filter(chain => chain.id > 0);

// Get chain by ID
export const getChainById = (chainId: number): ChainConfig | undefined => {
  return SUPPORTED_CHAINS.find(chain => chain.id === chainId);
};

// Default chain
export const DEFAULT_CHAIN = CHAIN_A;

