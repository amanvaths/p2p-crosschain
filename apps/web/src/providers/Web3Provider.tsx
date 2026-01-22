'use client';

// =============================================================================
// P2P Exchange - Web3 Provider
// =============================================================================

import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { config } from '@/lib/wagmi';

import '@rainbow-me/rainbowkit/styles.css';

// Custom RainbowKit theme to match our design
const customTheme = darkTheme({
  accentColor: '#00d4aa',
  accentColorForeground: '#0a0a0f',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  // Create QueryClient inside component with useState to prevent recreation
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={customTheme} 
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default Web3Provider;
