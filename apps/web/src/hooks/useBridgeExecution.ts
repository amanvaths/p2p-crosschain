'use client';

// =============================================================================
// P2P Exchange - Bridge Execution Hook
// =============================================================================

import { useCallback, useState, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, usePublicClient } from 'wagmi';
import type { Address, Hash } from 'viem';
import {
  BSC_CHAIN_ID,
  DSC_CHAIN_ID,
  getContractAddress,
  OrderStatus,
} from '@/lib/contracts';
import { useBscOrder, useDscOrder, useIsBscOrderMatched } from './useP2PVault';
import type { SignedOrder } from './useOrderSigning';

// =============================================================================
// Types
// =============================================================================

export enum BridgeStatus {
  IDLE = 'IDLE',
  PENDING_BSC_ORDER = 'PENDING_BSC_ORDER',
  BSC_ORDER_CREATED = 'BSC_ORDER_CREATED',
  PENDING_DSC_FILL = 'PENDING_DSC_FILL',
  DSC_FILLED = 'DSC_FILLED',
  PENDING_BSC_SETTLEMENT = 'PENDING_BSC_SETTLEMENT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export interface BridgeState {
  status: BridgeStatus;
  bscOrderId?: bigint;
  dscOrderId?: bigint;
  bscTxHash?: Hash;
  dscTxHash?: Hash;
  error?: string;
  lastUpdated: number;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing bridge execution flow between BSC and DSC
 * 
 * Flow:
 * 1. Buyer creates order on BSC (locks BEP20 USDT)
 * 2. Buyer signs EIP-712 order (off-chain)
 * 3. Seller fills order on DSC (locks DEP20 USDT, receives signature)
 * 4. Bridge relayer verifies and triggers BSC settlement
 * 5. Seller receives BEP20 USDT on BSC
 */
export function useBridgeExecution(bscOrderId?: bigint) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const bscClient = usePublicClient({ chainId: BSC_CHAIN_ID });
  const dscClient = usePublicClient({ chainId: DSC_CHAIN_ID });

  // Order states
  const { order: bscOrder, refetch: refetchBscOrder } = useBscOrder(bscOrderId);
  const { data: isMatched, refetch: refetchIsMatched } = useIsBscOrderMatched(bscOrderId);

  // Bridge state
  const [bridgeState, setBridgeState] = useState<BridgeState>({
    status: BridgeStatus.IDLE,
    lastUpdated: Date.now(),
  });

  // Polling interval for status updates
  const [isPolling, setIsPolling] = useState(false);

  /**
   * Determine bridge status from on-chain data
   */
  const determineStatus = useCallback(() => {
    if (!bscOrderId) {
      return BridgeStatus.IDLE;
    }

    if (!bscOrder) {
      return BridgeStatus.PENDING_BSC_ORDER;
    }

    switch (bscOrder.status) {
      case OrderStatus.OPEN:
        if (isMatched) {
          return BridgeStatus.DSC_FILLED;
        }
        return BridgeStatus.BSC_ORDER_CREATED;
      
      case OrderStatus.MATCHED:
        return BridgeStatus.PENDING_BSC_SETTLEMENT;
      
      case OrderStatus.COMPLETED:
        return BridgeStatus.COMPLETED;
      
      case OrderStatus.CANCELLED:
        return BridgeStatus.CANCELLED;
      
      case OrderStatus.EXPIRED:
      case OrderStatus.REFUNDED:
        return BridgeStatus.EXPIRED;
      
      default:
        return BridgeStatus.IDLE;
    }
  }, [bscOrderId, bscOrder, isMatched]);

  /**
   * Update bridge state
   */
  const updateBridgeState = useCallback(() => {
    const status = determineStatus();
    setBridgeState(prev => ({
      ...prev,
      status,
      bscOrderId,
      lastUpdated: Date.now(),
    }));
  }, [bscOrderId, determineStatus]);

  // Auto-update status when order data changes
  useEffect(() => {
    updateBridgeState();
  }, [updateBridgeState]);

  /**
   * Start polling for status updates
   */
  const startPolling = useCallback((intervalMs: number = 5000) => {
    setIsPolling(true);
    
    const poll = async () => {
      await refetchBscOrder();
      await refetchIsMatched();
      updateBridgeState();
    };

    const interval = setInterval(poll, intervalMs);
    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [refetchBscOrder, refetchIsMatched, updateBridgeState]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  /**
   * Wait for BSC order creation
   */
  const waitForBscOrder = useCallback(async (txHash: Hash): Promise<bigint | null> => {
    if (!bscClient) return null;

    try {
      setBridgeState(prev => ({ ...prev, status: BridgeStatus.PENDING_BSC_ORDER, bscTxHash: txHash }));
      
      const receipt = await bscClient.waitForTransactionReceipt({ hash: txHash });
      
      // Parse OrderCreated event to get orderId
      for (const log of receipt.logs) {
        // OrderCreated event signature
        if (log.topics[0] && log.topics[1]) {
          const orderId = BigInt(log.topics[1]);
          setBridgeState(prev => ({ 
            ...prev, 
            status: BridgeStatus.BSC_ORDER_CREATED, 
            bscOrderId: orderId,
            lastUpdated: Date.now(),
          }));
          return orderId;
        }
      }
      
      return null;
    } catch (error) {
      setBridgeState(prev => ({ 
        ...prev, 
        status: BridgeStatus.FAILED, 
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
      return null;
    }
  }, [bscClient]);

  /**
   * Wait for DSC fill confirmation
   */
  const waitForDscFill = useCallback(async (txHash: Hash): Promise<bigint | null> => {
    if (!dscClient) return null;

    try {
      setBridgeState(prev => ({ ...prev, status: BridgeStatus.PENDING_DSC_FILL, dscTxHash: txHash }));
      
      const receipt = await dscClient.waitForTransactionReceipt({ hash: txHash });
      
      // Parse DirectFillCreated event to get dscOrderId
      for (const log of receipt.logs) {
        if (log.topics[0] && log.topics[1]) {
          const dscOrderId = BigInt(log.topics[1]);
          setBridgeState(prev => ({ 
            ...prev, 
            status: BridgeStatus.DSC_FILLED, 
            dscOrderId,
            lastUpdated: Date.now(),
          }));
          return dscOrderId;
        }
      }
      
      return null;
    } catch (error) {
      setBridgeState(prev => ({ 
        ...prev, 
        status: BridgeStatus.FAILED, 
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
      return null;
    }
  }, [dscClient]);

  /**
   * Notify backend/relayer about DSC fill (for settlement)
   */
  const notifySettlement = useCallback(async (
    bscOrderId: bigint,
    dscOrderId: bigint,
    dscTxHash: Hash,
    signedOrder: SignedOrder,
  ) => {
    try {
      // Call backend API to trigger settlement
      const response = await fetch('/api/bridge/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bscOrderId: bscOrderId.toString(),
          dscOrderId: dscOrderId.toString(),
          dscTxHash,
          signature: signedOrder.signature,
          order: {
            orderId: signedOrder.order.orderId.toString(),
            buyerBsc: signedOrder.order.buyerBsc,
            buyerDscReceiver: signedOrder.order.buyerDscReceiver,
            depAmount: signedOrder.order.depAmount.toString(),
            usdtAmount: signedOrder.order.usdtAmount.toString(),
            expiry: signedOrder.order.expiry.toString(),
            srcChainId: signedOrder.order.srcChainId.toString(),
            dstChainId: signedOrder.order.dstChainId.toString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to notify settlement');
      }

      setBridgeState(prev => ({ 
        ...prev, 
        status: BridgeStatus.PENDING_BSC_SETTLEMENT,
        lastUpdated: Date.now(),
      }));

      return await response.json();
    } catch (error) {
      console.error('Settlement notification failed:', error);
      // Don't change status - relayer might pick it up automatically
      return null;
    }
  }, []);

  /**
   * Switch to the correct chain for an action
   */
  const ensureChain = useCallback(async (targetChainId: number) => {
    if (chainId !== targetChainId) {
      await switchChain({ chainId: targetChainId });
      // Wait for chain switch
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, [chainId, switchChain]);

  /**
   * Get human-readable status message
   */
  const getStatusMessage = useCallback((status: BridgeStatus): string => {
    switch (status) {
      case BridgeStatus.IDLE:
        return 'Ready to create order';
      case BridgeStatus.PENDING_BSC_ORDER:
        return 'Creating order on BSC...';
      case BridgeStatus.BSC_ORDER_CREATED:
        return 'Order created! Waiting for seller to fill on DSC';
      case BridgeStatus.PENDING_DSC_FILL:
        return 'Seller is filling order on DSC...';
      case BridgeStatus.DSC_FILLED:
        return 'Order filled! Processing cross-chain settlement...';
      case BridgeStatus.PENDING_BSC_SETTLEMENT:
        return 'Finalizing settlement on BSC...';
      case BridgeStatus.COMPLETED:
        return '✅ Trade completed successfully!';
      case BridgeStatus.FAILED:
        return '❌ Trade failed';
      case BridgeStatus.EXPIRED:
        return '⏰ Order expired';
      case BridgeStatus.CANCELLED:
        return '🚫 Order cancelled';
      default:
        return 'Unknown status';
    }
  }, []);

  /**
   * Get timeline steps for UI display
   */
  const getTimelineSteps = useCallback(() => {
    const steps = [
      { id: 1, label: 'Create Order (BSC)', status: 'pending' as const },
      { id: 2, label: 'Sign Order', status: 'pending' as const },
      { id: 3, label: 'Fill Order (DSC)', status: 'pending' as const },
      { id: 4, label: 'Settlement (BSC)', status: 'pending' as const },
      { id: 5, label: 'Complete', status: 'pending' as const },
    ];

    switch (bridgeState.status) {
      case BridgeStatus.BSC_ORDER_CREATED:
        steps[0].status = 'complete';
        steps[1].status = 'active';
        break;
      case BridgeStatus.PENDING_DSC_FILL:
        steps[0].status = 'complete';
        steps[1].status = 'complete';
        steps[2].status = 'active';
        break;
      case BridgeStatus.DSC_FILLED:
      case BridgeStatus.PENDING_BSC_SETTLEMENT:
        steps[0].status = 'complete';
        steps[1].status = 'complete';
        steps[2].status = 'complete';
        steps[3].status = 'active';
        break;
      case BridgeStatus.COMPLETED:
        steps.forEach(s => s.status = 'complete');
        break;
      case BridgeStatus.FAILED:
      case BridgeStatus.EXPIRED:
      case BridgeStatus.CANCELLED:
        // Mark up to the last successful step
        break;
    }

    return steps;
  }, [bridgeState.status]);

  return {
    // State
    bridgeState,
    bscOrder,
    isMatched,
    isPolling,
    
    // Actions
    waitForBscOrder,
    waitForDscFill,
    notifySettlement,
    startPolling,
    stopPolling,
    ensureChain,
    refetchBscOrder,
    refetchIsMatched,
    
    // Helpers
    getStatusMessage,
    getTimelineSteps,
    
    // Chain helpers
    isOnBsc: chainId === BSC_CHAIN_ID,
    isOnDsc: chainId === DSC_CHAIN_ID,
    switchToBsc: () => switchChain({ chainId: BSC_CHAIN_ID }),
    switchToDsc: () => switchChain({ chainId: DSC_CHAIN_ID }),
  };
}

