'use client';

// =============================================================================
// P2P Exchange - Order Card Component
// =============================================================================

import Link from 'next/link';
import type { OrderWithEscrows } from '@p2p/shared';
import {
  truncateAddress,
  formatAmount,
  formatCountdown,
  getStatusColor,
  getStatusLabel,
  getExplorerAddressUrl,
} from '@/lib/utils';
import { getToken } from '@/lib/config';

interface OrderCardProps {
  order: OrderWithEscrows;
}

export function OrderCard({ order }: OrderCardProps) {
  const sellToken = getToken(order.srcChainId, order.sellToken);
  const buyToken = getToken(order.dstChainId, order.buyToken);

  const statusColor = getStatusColor(order.status);

  return (
    <Link href={`/order/${order.id}`}>
      <div className="card-hover group">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className={`badge badge-${statusColor}`}>
            {getStatusLabel(order.status)}
          </span>
          <span className="text-xs text-muted font-mono">
            #{order.orderId.toString()}
          </span>
        </div>

        {/* Swap Display */}
        <div className="flex items-center gap-4 mb-4">
          {/* Sell Side */}
          <div className="flex-1 p-3 rounded-lg bg-surface-light/50">
            <div className="text-xs text-muted mb-1">Selling</div>
            <div className="text-lg font-semibold text-white">
              {formatAmount(order.sellAmount, sellToken?.decimals ?? 18, 4)}
              <span className="text-primary ml-1">
                {sellToken?.symbol ?? 'TOKEN'}
              </span>
            </div>
            <div className="text-xs text-muted mt-1">
              on Chain {order.srcChainId}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-surface-lighter flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </div>
          </div>

          {/* Buy Side */}
          <div className="flex-1 p-3 rounded-lg bg-surface-light/50">
            <div className="text-xs text-muted mb-1">For</div>
            <div className="text-lg font-semibold text-white">
              {formatAmount(order.buyAmount, buyToken?.decimals ?? 18, 4)}
              <span className="text-secondary ml-1">
                {buyToken?.symbol ?? 'TOKEN'}
              </span>
            </div>
            <div className="text-xs text-muted mt-1">
              on Chain {order.dstChainId}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-secondary to-accent" />
            <span className="text-sm text-muted">
              {truncateAddress(order.maker)}
            </span>
          </div>

          {order.status === 'OPEN' && (
            <div className="text-sm text-warning">
              ⏱ {formatCountdown(order.makerTimelock)}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default OrderCard;

