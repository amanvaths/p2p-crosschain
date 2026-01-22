'use client';

// =============================================================================
// P2P Exchange - Secret Display Component
// =============================================================================

import { useState } from 'react';
import {
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import type { Hex, Hash } from 'viem';

interface SecretDisplayProps {
  secret?: Hex | null;
  hashLock: Hash;
  showCopyButton?: boolean;
  className?: string;
}

export function SecretDisplay({
  secret,
  hashLock,
  showCopyButton = true,
  className = '',
}: SecretDisplayProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState<'secret' | 'hash' | null>(null);

  const copyToClipboard = async (text: string, type: 'secret' | 'hash') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Hash Lock */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-muted">Hash Lock (H)</label>
          {showCopyButton && (
            <button
              onClick={() => copyToClipboard(hashLock, 'hash')}
              className="p-1 rounded hover:bg-white/5 transition-colors"
              title="Copy hash lock"
            >
              {copied === 'hash' ? (
                <CheckIcon className="w-4 h-4 text-success" />
              ) : (
                <ClipboardDocumentIcon className="w-4 h-4 text-muted" />
              )}
            </button>
          )}
        </div>
        <div className="p-3 bg-surface-light rounded-lg font-mono text-sm text-white/80 break-all">
          {hashLock}
        </div>
      </div>

      {/* Secret (if available) */}
      {secret && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-muted">
              Secret (S) - Keep Safe!
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="p-1 rounded hover:bg-white/5 transition-colors"
                title={showSecret ? 'Hide secret' : 'Show secret'}
              >
                {showSecret ? (
                  <EyeSlashIcon className="w-4 h-4 text-muted" />
                ) : (
                  <EyeIcon className="w-4 h-4 text-muted" />
                )}
              </button>
              {showCopyButton && (
                <button
                  onClick={() => copyToClipboard(secret, 'secret')}
                  className="p-1 rounded hover:bg-white/5 transition-colors"
                  title="Copy secret"
                >
                  {copied === 'secret' ? (
                    <CheckIcon className="w-4 h-4 text-success" />
                  ) : (
                    <ClipboardDocumentIcon className="w-4 h-4 text-muted" />
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg font-mono text-sm break-all">
            {showSecret ? (
              <span className="text-warning">{secret}</span>
            ) : (
              <span className="text-muted">
                ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-warning/80">
            ⚠️ Never share your secret until you've claimed your tokens on the
            destination chain. Anyone with the secret can claim the funds.
          </p>
        </div>
      )}

      {/* Secret not yet revealed */}
      {!secret && (
        <div>
          <label className="text-sm font-medium text-muted mb-2 block">
            Secret (S)
          </label>
          <div className="p-3 bg-surface-light rounded-lg">
            <span className="text-muted text-sm">
              Secret not yet revealed. The secret will appear here once the maker
              claims on the destination chain.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SecretDisplay;

