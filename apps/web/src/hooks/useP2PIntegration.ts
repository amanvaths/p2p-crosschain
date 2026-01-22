'use client';

// =============================================================================
// P2P Exchange - Full Integration Hook
// Combines all contract hooks for easy UI integration
// =============================================================================

import { useCallback, useState, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits, type Address, type Hash } from 'viem';
import {
  useCreateBuyOrder,
  useFillBscOrder,
  useCreateSellOrder,
  useCancelBscOrder,
  useCancelDscOrder,
  useBscOpenOrders,
  useDscOpenOrders,
  useUserBscOrders,
} from './useP2PVault';
import { useOrderSigning } from './useOrderSigning';
import { useBridgeExecution, BridgeStatus } from './useBridgeExecution';
import { BSC_CHAIN_ID, DSC_CHAIN_ID, OrderStatus } from '@/lib/contracts';

// =============================================================================
// Types
// =============================================================================

export interface UIOrder {
  id: string;
  orderId: bigint;
  chainId: number;
  userAddress: string;
  amount: string;
  amountWei: bigint;
  timestamp: number;
  expiresAt: number;
  type: 'buy' | 'sell';
  status: OrderStatus;
  price: string;
}

export interface TransactionState {
  step: 'idle' | 'approving' | 'creating' | 'signing' | 'filling' | 'settling' | 'complete' | 'error';
  txHash?: Hash;
  orderId?: bigint;
  error?: string;
}

// =============================================================================
// Main Integration Hook
// =============================================================================

export function useP2PIntegration() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Transaction state
  const [txState, setTxState] = useState<TransactionState>({ step: 'idle' });

  // Contract hooks
  const createBuyOrder = useCreateBuyOrder();
  const createSellOrder = useCreateSellOrder();
  const fillBscOrder = useFillBscOrder();
  const cancelBscOrder = useCancelBscOrder();
  const cancelDscOrder = useCancelDscOrder();
  const orderSigning = useOrderSigning();

  // Order data
  const bscOrders = useBscOpenOrders();
  const dscOrders = useDscOpenOrders();
  const userBscOrderIds = useUserBscOrders(address);

  // Reset transaction state
  const resetTxState = useCallback(() => {
    setTxState({ step: 'idle' });
    createBuyOrder.reset();
    createSellOrder.reset();
    fillBscOrder.reset();
  }, [createBuyOrder, createSellOrder, fillBscOrder]);

  // =============================================================================
  // Create Buy Order (BSC - User locks BEP20 USDT to buy DEP20)
  // =============================================================================

  const handleCreateBuyOrder = useCallback(async (amount: string): Promise<boolean> => {
    if (!isConnected) {
      setTxState({ step: 'error', error: 'Wallet not connected' });
      return false;
    }

    try {
      // Step 1: Switch to BSC if needed
      if (chainId !== BSC_CHAIN_ID) {
        await switchChain({ chainId: BSC_CHAIN_ID });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 2: Check if approval needed
      if (createBuyOrder.needsApproval(amount)) {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await createBuyOrder.approve(amountWei);
        
        // Wait for approval
        await new Promise(resolve => setTimeout(resolve, 3000));
        await createBuyOrder.refetchAllowance();
      }

      // Step 3: Create the buy order
      setTxState({ step: 'creating' });
      await createBuyOrder.createBuyOrder(amount);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'APPROVAL_NEEDED') {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await createBuyOrder.approve(amountWei);
        return true;
      }
      
      setTxState({ step: 'error', error: errorMessage });
      return false;
    }
  }, [isConnected, chainId, switchChain, createBuyOrder]);

  // =============================================================================
  // Create Sell Order (DSC - User locks DEP20 to sell for BEP20 USDT)
  // =============================================================================

  const handleCreateSellOrder = useCallback(async (amount: string): Promise<boolean> => {
    if (!isConnected) {
      setTxState({ step: 'error', error: 'Wallet not connected' });
      return false;
    }

    try {
      // Step 1: Switch to DSC if needed
      if (chainId !== DSC_CHAIN_ID) {
        await switchChain({ chainId: DSC_CHAIN_ID });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 2: Check if approval needed
      if (createSellOrder.needsApproval(amount)) {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await createSellOrder.approve(amountWei);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        await createSellOrder.refetchAllowance();
      }

      // Step 3: Create the sell order
      setTxState({ step: 'creating' });
      await createSellOrder.createSellOrder(amount);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'APPROVAL_NEEDED') {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await createSellOrder.approve(amountWei);
        return true;
      }
      
      setTxState({ step: 'error', error: errorMessage });
      return false;
    }
  }, [isConnected, chainId, switchChain, createSellOrder]);

  // =============================================================================
  // Fill BSC Order (DSC - Seller fills a buyer's order)
  // =============================================================================

  const handleFillBscOrder = useCallback(async (
    bscOrderId: bigint,
    buyer: Address,
    amount: string,
  ): Promise<boolean> => {
    if (!isConnected) {
      setTxState({ step: 'error', error: 'Wallet not connected' });
      return false;
    }

    try {
      // Step 1: Switch to DSC if needed
      if (chainId !== DSC_CHAIN_ID) {
        await switchChain({ chainId: DSC_CHAIN_ID });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 2: Check if approval needed
      if (fillBscOrder.needsApproval(amount)) {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await fillBscOrder.approve(amountWei);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        await fillBscOrder.refetchAllowance();
      }

      // Step 3: Fill the BSC order
      setTxState({ step: 'filling' });
      await fillBscOrder.fillBscBuyOrder(bscOrderId, buyer, amount);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'APPROVAL_NEEDED') {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await fillBscOrder.approve(amountWei);
        return true;
      }
      
      setTxState({ step: 'error', error: errorMessage });
      return false;
    }
  }, [isConnected, chainId, switchChain, fillBscOrder]);

  // =============================================================================
  // Cancel Order
  // =============================================================================

  const handleCancelOrder = useCallback(async (
    orderId: bigint,
    chainType: 'bsc' | 'dsc',
  ): Promise<boolean> => {
    if (!isConnected) {
      setTxState({ step: 'error', error: 'Wallet not connected' });
      return false;
    }

    try {
      if (chainType === 'bsc') {
        if (chainId !== BSC_CHAIN_ID) {
          await switchChain({ chainId: BSC_CHAIN_ID });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await cancelBscOrder.cancelOrder(orderId);
      } else {
        if (chainId !== DSC_CHAIN_ID) {
          await switchChain({ chainId: DSC_CHAIN_ID });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await cancelDscOrder.cancelSellOrder(orderId);
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTxState({ step: 'error', error: errorMessage });
      return false;
    }
  }, [isConnected, chainId, switchChain, cancelBscOrder, cancelDscOrder]);

  // =============================================================================
  // Transform on-chain orders to UI format
  // =============================================================================

  const transformBscOrders = useCallback((): UIOrder[] => {
    if (!bscOrders.orders) return [];
    
    const { orderIds, buyers, amounts, expiresAts } = bscOrders.orders;
    
    return orderIds.map((orderId, i) => ({
      id: `bsc-${orderId.toString()}`,
      orderId,
      chainId: BSC_CHAIN_ID,
      userAddress: `${buyers[i].slice(0, 6)}...${buyers[i].slice(-4)}`,
      amount: formatUnits(amounts[i], 18),
      amountWei: amounts[i],
      timestamp: Date.now() - Math.random() * 86400000, // Placeholder
      expiresAt: Number(expiresAts[i]) * 1000,
      type: 'buy' as const,
      status: OrderStatus.OPEN,
      price: '1.00',
    }));
  }, [bscOrders.orders]);

  const transformDscOrders = useCallback((): UIOrder[] => {
    if (!dscOrders.orders) return [];
    
    const { orderIds, sellers, amounts, expiresAts } = dscOrders.orders;
    
    return orderIds.map((orderId, i) => ({
      id: `dsc-${orderId.toString()}`,
      orderId,
      chainId: DSC_CHAIN_ID,
      userAddress: `${sellers[i].slice(0, 6)}...${sellers[i].slice(-4)}`,
      amount: formatUnits(amounts[i], 18),
      amountWei: amounts[i],
      timestamp: Date.now() - Math.random() * 86400000, // Placeholder
      expiresAt: Number(expiresAts[i]) * 1000,
      type: 'sell' as const,
      status: OrderStatus.OPEN,
      price: '1.00',
    }));
  }, [dscOrders.orders]);

  // Combined orders
  const allOrders = [...transformBscOrders(), ...transformDscOrders()];
  
  // Filter orders for display
  const buyOrders = allOrders.filter(o => o.type === 'buy'); // Show sell orders on buy tab
  const sellOrders = allOrders.filter(o => o.type === 'sell'); // Show buy orders on sell tab

  // =============================================================================
  // Track transaction progress
  // =============================================================================

  // Watch create buy order progress
  useEffect(() => {
    if (createBuyOrder.isSuccess) {
      setTxState({ step: 'complete', txHash: createBuyOrder.hash, orderId: createBuyOrder.orderId ?? undefined });
      bscOrders.refetch();
    }
    if (createBuyOrder.error) {
      setTxState({ step: 'error', error: createBuyOrder.error.message });
    }
  }, [createBuyOrder.isSuccess, createBuyOrder.error, createBuyOrder.hash, createBuyOrder.orderId]);

  // Watch create sell order progress
  useEffect(() => {
    if (createSellOrder.isSuccess) {
      setTxState({ step: 'complete', txHash: createSellOrder.hash });
      dscOrders.refetch();
    }
    if (createSellOrder.error) {
      setTxState({ step: 'error', error: createSellOrder.error.message });
    }
  }, [createSellOrder.isSuccess, createSellOrder.error, createSellOrder.hash]);

  // Watch fill order progress
  useEffect(() => {
    if (fillBscOrder.isSuccess) {
      setTxState({ step: 'settling', txHash: fillBscOrder.hash, orderId: fillBscOrder.dscOrderId ?? undefined });
      // Trigger settlement notification
      // This would be handled by the bridge relayer in production
    }
    if (fillBscOrder.error) {
      setTxState({ step: 'error', error: fillBscOrder.error.message });
    }
  }, [fillBscOrder.isSuccess, fillBscOrder.error, fillBscOrder.hash, fillBscOrder.dscOrderId]);

  return {
    // State
    txState,
    isConnected,
    chainId,
    address,
    
    // Actions
    handleCreateBuyOrder,
    handleCreateSellOrder,
    handleFillBscOrder,
    handleCancelOrder,
    resetTxState,
    
    // Orders
    allOrders,
    buyOrders,
    sellOrders,
    userBscOrderIds: userBscOrderIds.data ?? [],
    
    // Loading states
    isLoadingBscOrders: bscOrders.isLoading,
    isLoadingDscOrders: dscOrders.isLoading,
    
    // Refresh
    refetchOrders: () => {
      bscOrders.refetch();
      dscOrders.refetch();
    },
    
    // Transaction pending states
    isPending: createBuyOrder.isPending || createSellOrder.isPending || fillBscOrder.isPending,
    isConfirming: createBuyOrder.isConfirming || createSellOrder.isConfirming || fillBscOrder.isConfirming,
    
    // Chain helpers
    isOnBsc: chainId === BSC_CHAIN_ID,
    isOnDsc: chainId === DSC_CHAIN_ID,
    switchToBsc: () => switchChain({ chainId: BSC_CHAIN_ID }),
    switchToDsc: () => switchChain({ chainId: DSC_CHAIN_ID }),
    
    // Balances (for display)
    bscBalance: createBuyOrder.balance ? formatUnits(createBuyOrder.balance, 18) : '0',
    dscBalance: createSellOrder.balance ? formatUnits(createSellOrder.balance, 18) : '0',
  };
}

