'use client';

// =============================================================================
// P2P Exchange - Header Component with Chain Selector
// =============================================================================

import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchChain, useChainId } from 'wagmi';
import { bscChain, dscChain } from '@/lib/wagmi';

// Chain type for our selector
type ChainOption = {
  id: number;
  name: string;
  symbol: string;
  color: string;
};

const BSC_OPTION: ChainOption = { id: 56, name: 'BSC Chain', symbol: 'BNB', color: 'from-yellow-400 to-yellow-600' };
const DSC_OPTION: ChainOption = { id: 1555, name: 'DSC Chain', symbol: 'DSC', color: 'from-purple-400 to-purple-600' };

export function Header() {
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const [showChainSelector, setShowChainSelector] = useState(false);

  // Get current chain based on connected chainId
  const selectedChain = chainId === 1555 ? DSC_OPTION : BSC_OPTION;

  // Handle chain change
  const handleChainChange = (chain: ChainOption) => {
    setShowChainSelector(false);
    if (switchChain) {
      switchChain({ chainId: chain.id });
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <svg
                className="w-6 h-6 text-background"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="gradient-text">DEP20</span>
              <span className="text-white/80"> P2P</span>
            </span>
          </div>

          {/* Right Side - Chain Selector + Wallet */}
          <div className="flex items-center gap-3">
            {/* Chain Selector */}
            <div className="relative">
              <button
                onClick={() => setShowChainSelector(!showChainSelector)}
                className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-3 py-2 hover:bg-surface-light transition-colors"
              >
                <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${selectedChain.color} flex items-center justify-center text-xs font-bold text-black`}>
                  {selectedChain.symbol.charAt(0)}
                </div>
                <span className="text-white font-medium text-sm hidden sm:block">
                  {selectedChain.name}
                </span>
                <svg 
                  className={`w-4 h-4 text-muted transition-transform ${showChainSelector ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Chain Dropdown */}
              {showChainSelector && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowChainSelector(false)} 
                  />
                  
                  <div className="absolute top-full right-0 mt-2 w-64 bg-surface border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-2 border-b border-white/5">
                      <span className="text-xs text-muted uppercase tracking-wider px-2">Select Network</span>
                    </div>
                    
                    {/* BSC Chain */}
                    <button
                      onClick={() => handleChainChange(BSC_OPTION)}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors ${
                        selectedChain.id === BSC_OPTION.id ? 'bg-primary/10 border-l-2 border-primary' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${BSC_OPTION.color} flex items-center justify-center text-sm font-bold text-black`}>
                        B
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-white font-medium">{BSC_OPTION.name}</div>
                        <div className="text-xs text-muted">{BSC_OPTION.symbol} • ID: {BSC_OPTION.id}</div>
                      </div>
                      {selectedChain.id === BSC_OPTION.id && (
                        <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>

                    {/* DSC Chain */}
                    <button
                      onClick={() => handleChainChange(DSC_OPTION)}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors ${
                        selectedChain.id === DSC_OPTION.id ? 'bg-primary/10 border-l-2 border-primary' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${DSC_OPTION.color} flex items-center justify-center text-sm font-bold text-white`}>
                        D
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-white font-medium">{DSC_OPTION.name}</div>
                        <div className="text-xs text-muted">{DSC_OPTION.symbol} • ID: {DSC_OPTION.id}</div>
                      </div>
                      {selectedChain.id === DSC_OPTION.id && (
                        <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    
                    {/* Token Info */}
                    <div className="p-3 border-t border-white/5 bg-surface-light">
                      <div className="text-xs text-muted mb-2">Tokens on {selectedChain.name}:</div>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                          USDT
                        </span>
                        <span className="px-2 py-1 bg-primary/20 text-primary rounded text-xs">
                          DEP20
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Wallet Connect - Hide chain selector, only show account */}
            <ConnectButton chainStatus="none" showBalance={false} />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
