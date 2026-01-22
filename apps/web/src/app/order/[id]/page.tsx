'use client';

// =============================================================================
// P2P Exchange - Order Details Page
// =============================================================================

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { Hash, Hex } from 'viem';

import { SecretDisplay } from '@/components/SecretDisplay';
import { Countdown, ProgressCountdown } from '@/components/Countdown';
import { Timeline } from '@/components/Timeline';
import { useOrder, useOrderTimeline, useRefreshOrders } from '@/hooks/useOrders';
import { useLockTokens, useClaimTokens, useRefundTokens, useCanClaim, useCanRefund, useComputeLockId } from '@/hooks/useP2PEscrow';
import { useTokenApproval } from '@/hooks/useTokenApproval';
import {
  truncateAddress,
  formatAmount,
  getStatusColor,
  getStatusLabel,
  getExplorerTxUrl,
} from '@/lib/utils';
import { getToken, getContractAddress } from '@/lib/config';
import type { SwapStep } from '@p2p/shared';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { refreshOrder } = useRefreshOrders();

  // Fetch order data
  const { data: order, isLoading, error } = useOrder(id);
  const { data: timelineData } = useOrderTimeline(id);

  // Local state for taker actions
  const [takerSecret, setTakerSecret] = useState<Hex>();

  // Determine user role
  const isMaker = address && order?.maker.toLowerCase() === address.toLowerCase();
  const isTaker = address && order?.takerEscrow?.depositor.toLowerCase() === address.toLowerCase();

  // Get token info
  const sellToken = order ? getToken(order.srcChainId, order.sellToken) : undefined;
  const buyToken = order ? getToken(order.dstChainId, order.buyToken) : undefined;

  // Hooks for actions
  const { lock, isPending: isLocking, isConfirming: isLockConfirming } = useLockTokens();
  const { claim, isPending: isClaiming, isConfirming: isClaimConfirming } = useClaimTokens();
  const { refund, isPending: isRefunding, isConfirming: isRefundConfirming } = useRefundTokens();

  // Compute lock IDs for checking status
  const makerLockId = order ? useComputeLockId(
    order.orderId,
    order.maker as `0x${string}`,
    order.hashLock as Hash,
    order.srcChainId
  ).data : undefined;

  const takerLockId = order?.takerEscrow ? useComputeLockId(
    order.orderId,
    order.takerEscrow.depositor as `0x${string}`,
    order.hashLock as Hash,
    order.dstChainId
  ).data : undefined;

  // Check claim/refund status
  const { data: makerCanClaim } = useCanClaim(takerLockId as Hash | undefined, order?.dstChainId);
  const { data: takerCanClaim } = useCanClaim(makerLockId as Hash | undefined, order?.srcChainId);
  const { data: makerCanRefund } = useCanRefund(makerLockId as Hash | undefined, order?.srcChainId);
  const { data: takerCanRefund } = useCanRefund(takerLockId as Hash | undefined, order?.dstChainId);

  // Token approval for taker
  const { approve, needsApproval, isPending: isApproving } = useTokenApproval(
    order?.buyToken as `0x${string}` | undefined
  );

  // Build timeline steps
  const buildTimelineSteps = (): SwapStep[] => {
    if (!order) return [];

    const steps: SwapStep[] = [
      {
        id: '1',
        title: 'Order Created',
        description: `Maker created order for ${formatAmount(order.sellAmount, sellToken?.decimals ?? 18)} ${sellToken?.symbol ?? 'TOKEN'}`,
        status: 'completed',
        txHash: order.txHash as Hash,
        chainId: order.srcChainId,
      },
    ];

    if (order.makerEscrow) {
      steps.push({
        id: '2',
        title: 'Maker Locked Tokens',
        description: `Locked on Chain ${order.srcChainId}`,
        status: 'completed',
        txHash: order.makerEscrow.txHash as Hash,
        chainId: order.srcChainId,
      });
    } else {
      steps.push({
        id: '2',
        title: 'Waiting for Maker Lock',
        description: 'Maker needs to lock tokens in escrow',
        status: order.status === 'OPEN' ? 'active' : 'pending',
      });
    }

    if (order.takerEscrow) {
      steps.push({
        id: '3',
        title: 'Taker Locked Tokens',
        description: `Locked on Chain ${order.dstChainId}`,
        status: 'completed',
        txHash: order.takerEscrow.txHash as Hash,
        chainId: order.dstChainId,
      });
    } else if (order.makerEscrow) {
      steps.push({
        id: '3',
        title: 'Waiting for Taker',
        description: 'A taker needs to lock matching tokens',
        status: 'active',
      });
    } else {
      steps.push({
        id: '3',
        title: 'Taker Lock',
        description: 'Pending maker lock',
        status: 'pending',
      });
    }

    if (order.status === 'COMPLETED') {
      steps.push({
        id: '4',
        title: 'Swap Completed',
        description: 'Both parties claimed their tokens',
        status: 'completed',
      });
    } else if (order.status === 'REFUNDED') {
      steps.push({
        id: '4',
        title: 'Refunded',
        description: 'Timelock expired, funds returned',
        status: 'completed',
      });
    } else if (order.takerEscrow) {
      steps.push({
        id: '4',
        title: 'Awaiting Claims',
        description: 'Maker claims first, then taker uses revealed secret',
        status: 'active',
      });
    }

    return steps;
  };

  const timelineSteps = buildTimelineSteps();

  // Handle taker fill
  const handleTakerFill = async () => {
    if (!order || !address) return;

    // Switch to destination chain if needed
    if (chainId !== order.dstChainId) {
      switchChain({ chainId: order.dstChainId });
      return;
    }

    // Check approval
    const amount = BigInt(order.buyAmount);
    if (needsApproval(amount)) {
      await approve(amount);
      return;
    }

    // Lock tokens
    const timelock = BigInt(Math.floor(Date.now() / 1000) + Number(order.takerTimelock));
    await lock({
      orderId: order.orderId,
      recipient: order.maker as `0x${string}`,
      token: order.buyToken as `0x${string}`,
      amount,
      hashLock: order.hashLock as Hash,
      timelock,
    });

    refreshOrder(id);
  };

  // Handle claim
  const handleClaim = async (lockId: Hash, secret: Hex, targetChainId: number) => {
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
      return;
    }

    await claim(lockId, secret);
    refreshOrder(id);
  };

  // Handle refund
  const handleRefund = async (lockId: Hash, targetChainId: number) => {
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
      return;
    }

    await refund(lockId);
    refreshOrder(id);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card animate-pulse space-y-4">
          <div className="h-8 bg-surface-light rounded w-1/3" />
          <div className="h-4 bg-surface-light rounded w-2/3" />
          <div className="h-32 bg-surface-light rounded" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card text-center py-12">
          <div className="text-xl font-semibold text-error mb-2">Order not found</div>
          <p className="text-muted mb-6">This order may not exist or hasn't been indexed yet.</p>
          <Link href="/" className="btn-primary">
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const statusColor = getStatusColor(order.status);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="fade-in">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted hover:text-white transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Orders
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">Order #{order.orderId.toString()}</h1>
              <span className={`badge badge-${statusColor}`}>
                {getStatusLabel(order.status)}
              </span>
            </div>
            <p className="text-muted">
              Created by{' '}
              <a
                href={getExplorerTxUrl(order.srcChainId, order.maker)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-light"
              >
                {truncateAddress(order.maker)}
              </a>
              {isMaker && <span className="ml-2 text-primary">(You)</span>}
            </p>
          </div>

          {order.status === 'MAKER_LOCKED' && !isMaker && isConnected && (
            <button
              onClick={handleTakerFill}
              disabled={isLocking || isLockConfirming || isApproving}
              className="btn-primary"
            >
              {isApproving
                ? 'Approving...'
                : isLocking || isLockConfirming
                ? 'Locking...'
                : 'Fill Order'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Swap Details */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Swap Details</h2>

              <div className="flex items-center gap-4">
                {/* Sell Side */}
                <div className="flex-1 p-4 rounded-lg bg-surface-light/50">
                  <div className="text-xs text-muted mb-1">Selling</div>
                  <div className="text-xl font-bold text-white">
                    {formatAmount(order.sellAmount, sellToken?.decimals ?? 18)}
                    <span className="text-primary ml-2">{sellToken?.symbol ?? 'TOKEN'}</span>
                  </div>
                  <div className="text-xs text-muted mt-2">
                    Chain {order.srcChainId}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>

                {/* Buy Side */}
                <div className="flex-1 p-4 rounded-lg bg-surface-light/50">
                  <div className="text-xs text-muted mb-1">For</div>
                  <div className="text-xl font-bold text-white">
                    {formatAmount(order.buyAmount, buyToken?.decimals ?? 18)}
                    <span className="text-secondary ml-2">{buyToken?.symbol ?? 'TOKEN'}</span>
                  </div>
                  <div className="text-xs text-muted mt-2">
                    Chain {order.dstChainId}
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Progress</h2>
              <Timeline steps={timelineSteps} />
            </div>

            {/* Secret Display */}
            {(isMaker || order.secret) && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-4">HTLC Secret</h2>
                <SecretDisplay
                  secret={order.secret as Hex | undefined}
                  hashLock={order.hashLock as Hash}
                />
              </div>
            )}

            {/* Taker Secret Input (for claiming) */}
            {isTaker && !order.secret && order.status === 'TAKER_LOCKED' && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-4">Enter Secret to Claim</h2>
                <p className="text-muted text-sm mb-4">
                  Once the maker claims on Chain {order.dstChainId}, the secret will be revealed. 
                  Enter it here to claim your tokens.
                </p>
                <input
                  type="text"
                  placeholder="0x..."
                  value={takerSecret ?? ''}
                  onChange={(e) => setTakerSecret(e.target.value as Hex)}
                  className="input mb-4"
                />
                <button
                  onClick={() => takerSecret && makerLockId && handleClaim(makerLockId as Hash, takerSecret, order.srcChainId)}
                  disabled={!takerSecret || !takerCanClaim || isClaiming || isClaimConfirming}
                  className="btn-primary w-full"
                >
                  {isClaiming || isClaimConfirming ? 'Claiming...' : 'Claim Tokens'}
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Timelocks */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Timelocks</h3>

              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted mb-1">Maker Timelock</div>
                  <ProgressCountdown
                    timestamp={order.makerTimelock}
                    totalDuration={86400} // 24 hours
                  />
                </div>

                <div>
                  <div className="text-xs text-muted mb-1">Taker Timelock</div>
                  <ProgressCountdown
                    timestamp={order.takerTimelock}
                    totalDuration={43200} // 12 hours
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            {isConnected && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Actions</h3>

                <div className="space-y-3">
                  {/* Maker Claim (on dst chain) */}
                  {isMaker && makerCanClaim && takerLockId && order.secret && (
                    <button
                      onClick={() => handleClaim(takerLockId as Hash, order.secret as Hex, order.dstChainId)}
                      disabled={isClaiming || isClaimConfirming}
                      className="btn-primary w-full"
                    >
                      {isClaiming || isClaimConfirming ? 'Claiming...' : 'Claim on Dst Chain'}
                    </button>
                  )}

                  {/* Maker Refund */}
                  {isMaker && makerCanRefund && makerLockId && (
                    <button
                      onClick={() => handleRefund(makerLockId as Hash, order.srcChainId)}
                      disabled={isRefunding || isRefundConfirming}
                      className="btn-outline w-full"
                    >
                      {isRefunding || isRefundConfirming ? 'Refunding...' : 'Refund Tokens'}
                    </button>
                  )}

                  {/* Taker Refund */}
                  {isTaker && takerCanRefund && takerLockId && (
                    <button
                      onClick={() => handleRefund(takerLockId as Hash, order.dstChainId)}
                      disabled={isRefunding || isRefundConfirming}
                      className="btn-outline w-full"
                    >
                      {isRefunding || isRefundConfirming ? 'Refunding...' : 'Refund Tokens'}
                    </button>
                  )}

                  {!isMaker && !isTaker && order.status === 'OPEN' && (
                    <p className="text-sm text-muted text-center">
                      Connect as the maker to manage this order, or wait for maker to lock tokens to fill.
                    </p>
                  )}
                </div>
              </div>
            )}

            {!isConnected && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Connect Wallet</h3>
                <p className="text-sm text-muted mb-4">
                  Connect your wallet to interact with this order.
                </p>
                <ConnectButton />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

