'use client';

// =============================================================================
// P2P Exchange - Token Input Component
// =============================================================================

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { formatAmount, parseAmount } from '@/lib/utils';
import { useTokenBalance, useTokenInfo } from '@/hooks/useTokenApproval';
import { getTokens, type TokenConfig } from '@/lib/config';

interface TokenInputProps {
  label: string;
  chainId: number;
  value: string;
  token: Address | undefined;
  onChange: (value: string) => void;
  onTokenChange: (token: Address) => void;
  disabled?: boolean;
  showBalance?: boolean;
  error?: string;
}

export function TokenInput({
  label,
  chainId,
  value,
  token,
  onChange,
  onTokenChange,
  disabled = false,
  showBalance = true,
  error,
}: TokenInputProps) {
  const { isConnected } = useAccount();
  const tokens = getTokens(chainId);
  const { balance } = useTokenBalance(token);
  const { symbol, decimals } = useTokenInfo(token);

  const handleMaxClick = () => {
    if (balance && decimals) {
      const formatted = formatAmount(balance, decimals, decimals);
      onChange(formatted);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        {showBalance && isConnected && token && (
          <div className="text-xs text-muted">
            Balance:{' '}
            <span className="text-white/80">
              {balance ? formatAmount(balance, decimals ?? 18, 4) : '0'}{' '}
              {symbol ?? 'TOKEN'}
            </span>
          </div>
        )}
      </div>

      <div
        className={`flex items-stretch rounded-lg border bg-surface-light ${
          error ? 'border-error' : 'border-white/10 focus-within:border-primary'
        }`}
      >
        {/* Amount Input */}
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => {
            // Only allow valid decimal input
            const newValue = e.target.value;
            if (/^[0-9]*\.?[0-9]*$/.test(newValue)) {
              onChange(newValue);
            }
          }}
          disabled={disabled}
          className="flex-1 min-w-0 px-4 py-3 bg-transparent text-white text-lg font-medium placeholder-muted focus:outline-none disabled:opacity-50"
        />

        {/* Max Button */}
        {showBalance && isConnected && balance && (
          <button
            type="button"
            onClick={handleMaxClick}
            disabled={disabled}
            className="px-2 text-xs font-medium text-primary hover:text-primary-light transition-colors disabled:opacity-50"
          >
            MAX
          </button>
        )}

        {/* Token Selector */}
        <div className="flex items-center border-l border-white/10">
          <select
            value={token ?? ''}
            onChange={(e) => onTokenChange(e.target.value as Address)}
            disabled={disabled || tokens.length === 0}
            className="h-full px-4 py-3 bg-transparent text-white font-medium focus:outline-none cursor-pointer disabled:opacity-50 appearance-none pr-8"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
              backgroundSize: '16px',
            }}
          >
            <option value="" disabled>
              Select
            </option>
            {tokens.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

export default TokenInput;

