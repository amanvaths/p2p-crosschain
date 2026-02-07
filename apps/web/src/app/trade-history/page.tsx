'use client';

// =============================================================================
// P2P Exchange - Trade History Page
// Shows all buy/sell orders from all users
// =============================================================================

import { useState } from 'react';
import { formatUnits } from 'viem';
import { useDbOrders } from '@/hooks/useDatabase';
import { BSC_CHAIN_ID, DSC_CHAIN_ID } from '@/lib/contracts';
import Link from 'next/link';

// Format time ago
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Format date
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function TradeHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [chainFilter, setChainFilter] = useState<'all' | 'bsc' | 'dsc'>('all');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Fetch all orders from database
  const { orders, total, loading, error, refetch } = useDbOrders({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit,
    offset: (page - 1) * limit,
  });

  // Filter orders by type and chain
  const filteredOrders = (orders || []).filter((order: any) => {
    // Type filter
    if (typeFilter !== 'all') {
      const isBuy = order.srcChainId === BSC_CHAIN_ID;
      if (typeFilter === 'buy' && !isBuy) return false;
      if (typeFilter === 'sell' && isBuy) return false;
    }

    // Chain filter
    if (chainFilter !== 'all') {
      if (chainFilter === 'bsc' && order.srcChainId !== BSC_CHAIN_ID) return false;
      if (chainFilter === 'dsc' && order.srcChainId !== DSC_CHAIN_ID) return false;
    }

    return true;
  });

  const totalPages = Math.ceil((total || 0) / limit);

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Binance Style */}
      <div className="bg-surface border-b border-white/5 py-6">
        <div className="max-w-[92rem] mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1 text-white">
                Trade History
              </h1>
              <p className="text-muted text-sm">
                All buy and sell orders from all users
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-surface-light text-white hover:bg-surface-lighter border border-white/10"
            >
              ← Back
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[92rem] mx-auto px-4 py-6">
        {/* Filters - Binance Style */}
        <div className="bg-surface rounded-lg border border-white/5 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-muted text-sm">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-surface-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
              >
                <option value="all">All Status</option>
                <option value="OPEN">Open</option>
                <option value="MAKER_LOCKED">Maker Locked</option>
                <option value="TAKER_LOCKED">Taker Locked</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-muted text-sm">Type:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setTypeFilter('all');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    typeFilter === 'all'
                      ? 'bg-primary text-white'
                      : 'bg-surface-light text-muted hover:text-white'
                  }`}
                >
                  ALL
                </button>
                <button
                  onClick={() => {
                    setTypeFilter('buy');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    typeFilter === 'buy'
                      ? 'bg-green-500 text-white'
                      : 'bg-surface-light text-muted hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  onClick={() => {
                    setTypeFilter('sell');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    typeFilter === 'sell'
                      ? 'bg-red-500 text-white'
                      : 'bg-surface-light text-muted hover:text-white'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            {/* Chain Filter */}
            <div className="flex items-center gap-2">
              <span className="text-muted text-sm">Chain:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setChainFilter('all');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chainFilter === 'all'
                      ? 'bg-primary text-white'
                      : 'bg-surface-light text-muted hover:text-white'
                  }`}
                >
                  ALL
                </button>
                <button
                  onClick={() => {
                    setChainFilter('bsc');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chainFilter === 'bsc'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-surface-light text-muted hover:text-white'
                  }`}
                >
                  BSC
                </button>
                <button
                  onClick={() => {
                    setChainFilter('dsc');
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chainFilter === 'dsc'
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-light text-muted hover:text-white'
                  }`}
                >
                  DSC
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="ml-auto flex items-center gap-4 text-sm">
              <span className="text-muted">Total: <span className="text-white font-semibold">{total || 0}</span></span>
              <span className="text-muted">Showing: <span className="text-white font-semibold">{filteredOrders.length}</span></span>
            </div>
          </div>
        </div>

        {/* Orders Table - Binance Style */}
        <div className="bg-surface rounded-lg border border-white/5 overflow-hidden">
          {/* Table Header - Binance Style */}
          <div className="hidden md:grid bg-surface-light/50 border-b border-white/5 px-6 py-3 grid-cols-[60px_100px_140px_140px_120px_100px_100px_100px_80px] gap-4 text-xs font-semibold text-muted uppercase tracking-wider">
            <div className="text-center">Type</div>
            <div>Order ID</div>
            <div>Maker</div>
            <div>Taker</div>
            <div className="text-right">Amount</div>
            <div className="text-center">Chains</div>
            <div className="text-center">Status</div>
            <div className="text-right">Time</div>
            <div className="text-center">TX</div>
          </div>

          {/* Orders List */}
          <div className="divide-y divide-white/5">
            {loading && (
              <div className="px-4 py-8 text-center">
                <div className="inline-flex items-center gap-2 text-muted">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading orders...
                </div>
              </div>
            )}

            {error && (
              <div className="px-4 py-8 text-center text-red-400">
                Error loading orders: {error}
              </div>
            )}

            {!loading && !error && filteredOrders.length === 0 && (
              <div className="px-4 py-8 text-center text-muted">
                No orders found
              </div>
            )}

            {!loading && !error && filteredOrders.map((order: any, index: number) => {
              const isBuy = order.srcChainId === BSC_CHAIN_ID;
              const amount = formatUnits(BigInt(order.sellAmount || '0'), 18);
              const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
              const hasTrade = order.takerAddress || (order.status === 'MAKER_LOCKED' || order.status === 'TAKER_LOCKED' || order.status === 'COMPLETED');
              const transactionHashes = order.transactionHashes || [];
              const mainTxHash = transactionHashes.length > 0 ? transactionHashes[0]?.txHash : order.txHash;
              
              return (
                <div
                  key={order.id || index}
                  className="hidden md:grid px-6 py-4 grid-cols-[60px_100px_140px_140px_120px_100px_100px_100px_80px] gap-4 items-center hover:bg-white/[0.02] transition-colors border-b border-white/5"
                >
                  {/* Type */}
                  <div className="flex items-center justify-center gap-1">
                    {isBuy ? (
                      <span className="text-green-400 font-bold text-sm">BUY</span>
                    ) : (
                      <span className="text-red-400 font-bold text-sm">SELL</span>
                    )}
                    {order.isPartialTrade && (
                      <span className="text-xs text-orange-400" title="Partial Trade">⚠</span>
                    )}
                  </div>

                  {/* Order ID */}
                  <div>
                    <span className="font-mono text-xs text-white/90">
                      #{order.orderId || 'N/A'}
                    </span>
                  </div>

                  {/* Maker */}
                  <div>
                    <span className="font-mono text-xs text-white/80 hover:text-white cursor-pointer" title={order.maker}>
                      {order.maker ? `${order.maker.slice(0, 8)}...${order.maker.slice(-6)}` : 'Unknown'}
                    </span>
                  </div>

                  {/* Taker */}
                  <div>
                    {hasTrade && order.takerAddress ? (
                      <span className="font-mono text-xs text-white/80 hover:text-white cursor-pointer" title={order.takerAddress}>
                        {`${order.takerAddress.slice(0, 8)}...${order.takerAddress.slice(-6)}`}
                      </span>
                    ) : (
                      <span className="text-xs text-muted/50">—</span>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <div className="font-semibold text-sm text-white">
                      {Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted">USDT</div>
                  </div>

                  {/* Chains */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        order.srcChainId === BSC_CHAIN_ID
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {order.srcChainId === BSC_CHAIN_ID ? 'BSC' : 'DSC'}
                      </span>
                      {hasTrade && (
                        <>
                          <span className="text-muted text-xs">→</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            order.dstChainId === BSC_CHAIN_ID
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {order.dstChainId === BSC_CHAIN_ID ? 'BSC' : 'DSC'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      order.status === 'OPEN' ? 'bg-green-500/20 text-green-400'
                      : order.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400'
                      : order.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400'
                      : order.status === 'REFUNDED' ? 'bg-orange-500/20 text-orange-400'
                      : order.status === 'EXPIRED' ? 'bg-orange-500/20 text-orange-400'
                      : order.status === 'MAKER_LOCKED' || order.status === 'TAKER_LOCKED' ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {order.status?.replace('_', ' ') || 'UNKNOWN'}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="text-right">
                    <div className="text-xs text-white/80">{formatTimeAgo(createdAt.getTime())}</div>
                    <div className="text-xs text-muted/70">{new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>

                  {/* Transaction */}
                  <div className="text-center">
                    {(() => {
                      // Try transactionHashes first, then order.txHash, then show placeholder
                      const txHash = transactionHashes.length > 0 
                        ? transactionHashes[0]?.txHash 
                        : (order.txHash && order.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
                          ? order.txHash 
                          : null);
                      
                      if (txHash) {
                        return (
                          <a
                            href={`https://${order.srcChainId === BSC_CHAIN_ID ? 'bscscan.com' : 'dscscan.io'}/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:text-primary-light underline"
                            title="View Transaction"
                          >
                            {txHash.slice(0, 8)}...
                          </a>
                        );
                      }
                      return (
                        <span className="text-xs text-muted/50" title="Transaction hash not available">—</span>
                      );
                    })()}
                  </div>
                </div>
              );
            })}

            {/* Mobile View - Binance Style */}
            {!loading && !error && filteredOrders.map((order: any, index: number) => {
              const isBuy = order.srcChainId === BSC_CHAIN_ID;
              const amount = formatUnits(BigInt(order.sellAmount || '0'), 18);
              const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
              const hasTrade = order.takerAddress || (order.status === 'MAKER_LOCKED' || order.status === 'TAKER_LOCKED' || order.status === 'COMPLETED');
              const transactionHashes = order.transactionHashes || [];
              const mainTxHash = transactionHashes.length > 0 ? transactionHashes[0]?.txHash : order.txHash;
              
              return (
                <div
                  key={`mobile-${order.id || index}`}
                  className="md:hidden p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {isBuy ? (
                        <span className="text-green-400 font-bold text-sm">BUY</span>
                      ) : (
                        <span className="text-red-400 font-bold text-sm">SELL</span>
                      )}
                      <span className="font-mono text-xs text-white/60">#{order.orderId}</span>
                      {order.isPartialTrade && (
                        <span className="text-xs text-orange-400" title="Partial Trade">⚠</span>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      order.status === 'OPEN' ? 'bg-green-500/20 text-green-400'
                      : order.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400'
                      : order.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400'
                      : order.status === 'REFUNDED' ? 'bg-orange-500/20 text-orange-400'
                      : order.status === 'EXPIRED' ? 'bg-orange-500/20 text-orange-400'
                      : order.status === 'MAKER_LOCKED' || order.status === 'TAKER_LOCKED' ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {order.status?.replace('_', ' ') || 'UNKNOWN'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted mb-1">Maker</div>
                      <div className="font-mono text-xs text-white/80">
                        {order.maker ? `${order.maker.slice(0, 8)}...${order.maker.slice(-6)}` : 'Unknown'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">Taker</div>
                      {hasTrade && order.takerAddress ? (
                        <div className="font-mono text-xs text-white/80">
                          {`${order.takerAddress.slice(0, 8)}...${order.takerAddress.slice(-6)}`}
                        </div>
                      ) : (
                        <div className="text-xs text-muted/50">—</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">Amount</div>
                      <div className="font-semibold text-white">
                        {Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">Chains</div>
                      <div className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          order.srcChainId === BSC_CHAIN_ID
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {order.srcChainId === BSC_CHAIN_ID ? 'BSC' : 'DSC'}
                        </span>
                        {hasTrade && (
                          <>
                            <span className="text-muted text-xs">→</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              order.dstChainId === BSC_CHAIN_ID
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {order.dstChainId === BSC_CHAIN_ID ? 'BSC' : 'DSC'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">Time</div>
                      <div className="text-xs text-white/80">{formatTimeAgo(createdAt.getTime())}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">Transaction</div>
                      {(() => {
                        const txHash = transactionHashes.length > 0 
                          ? transactionHashes[0]?.txHash 
                          : (order.txHash && order.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
                            ? order.txHash 
                            : null);
                        
                        if (txHash) {
                          return (
                            <a
                              href={`https://${order.srcChainId === BSC_CHAIN_ID ? 'bscscan.com' : 'dscscan.io'}/tx/${txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:text-primary-light underline"
                            >
                              {txHash.slice(0, 8)}...
                            </a>
                          );
                        }
                        return (
                          <span className="text-xs text-muted/50" title="Transaction hash not available">—</span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination - Binance Style */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-surface-light/30">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-lg font-medium text-white bg-surface border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-light transition-colors"
              >
                ← Previous
              </button>
              <span className="text-sm text-muted">
                Page <span className="text-white font-semibold">{page}</span> of <span className="text-white font-semibold">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded-lg font-medium text-white bg-surface border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-light transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

