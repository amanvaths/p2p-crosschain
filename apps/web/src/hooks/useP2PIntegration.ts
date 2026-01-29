'use client';

// =============================================================================
// P2P Exchange - Full Integration Hook
// Combines all contract hooks for easy UI integration
// =============================================================================

import { useCallback, useState, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, usePublicClient } from 'wagmi';
import { parseUnits, formatUnits, type Address, type Hash, createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
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
import { BSC_CHAIN_ID, DSC_CHAIN_ID, OrderStatus, P2PVaultBSCABI } from '@/lib/contracts';
import { chainsConfig } from '@/lib/chains.config';

// =============================================================================
// Types
// =============================================================================

export interface UIOrder {
  id: string;
  orderId: bigint;
  chainId: number;
  userAddress: string;
  fullAddress: string; // Full address for contract calls
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
  const { switchChain, switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  // Transaction state
  const [txState, setTxState] = useState<TransactionState>({ step: 'idle' });

  // Contract hooks
  const createBuyOrderHook = useCreateBuyOrder();
  const createSellOrder = useCreateSellOrder();
  const fillBscOrderHook = useFillBscOrder();
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
    createBuyOrderHook.reset();
    createSellOrder.reset();
    fillBscOrderHook.reset();
  }, [createBuyOrderHook, createSellOrder, fillBscOrderHook]);

  // =============================================================================
  // NEW: Individual functions for step-by-step modal
  // =============================================================================

  // Switch to specific chain
  const switchToChain = useCallback(async (targetChainId: number): Promise<void> => {
    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
      // Wait for chain switch to propagate
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }, [chainId, switchChainAsync]);

  // Approve token for spending (returns tx hash)
  const approveToken = useCallback(async (
    chain: 'bsc' | 'dsc', 
    amount: string
  ): Promise<{ hash: Hash } | null> => {
    const amountWei = parseUnits(amount, 18);
    
    if (chain === 'bsc') {
      // Check if approval already sufficient
      if (!createBuyOrderHook.needsApproval(amount)) {
        return { hash: '0x0' as Hash }; // Already approved
      }
      await createBuyOrderHook.approve(amountWei);
      // Return the approval tx hash from the hook
      return { hash: createBuyOrderHook.hash || '0x0' as Hash };
    } else {
      // DSC approval for fill order
      if (!fillBscOrderHook.needsApproval(amount)) {
        return { hash: '0x0' as Hash }; // Already approved
      }
      await fillBscOrderHook.approve(amountWei);
      return { hash: fillBscOrderHook.hash || '0x0' as Hash };
    }
  }, [createBuyOrderHook, fillBscOrderHook]);

  // Fill BSC order (returns tx hash)
  const fillBscOrder = useCallback(async (
    bscOrderId: bigint,
    buyer: Address,
    amount: string
  ): Promise<{ hash: Hash } | null> => {
    await fillBscOrderHook.fillBscBuyOrder(bscOrderId, buyer, amount);
    // Wait for the hook to update with the hash
    await new Promise(resolve => setTimeout(resolve, 500));
    return { hash: fillBscOrderHook.hash || '0x0' as Hash };
  }, [fillBscOrderHook]);

  // Create buy order (returns tx hash)
  const createBuyOrder = useCallback(async (
    amount: string
  ): Promise<{ hash: Hash } | null> => {
    await createBuyOrderHook.createBuyOrder(amount);
    await new Promise(resolve => setTimeout(resolve, 500));
    return { hash: createBuyOrderHook.hash || '0x0' as Hash };
  }, [createBuyOrderHook]);

  // Wait for transaction confirmation
  const waitForTransaction = useCallback(async (
    hash: Hash,
    targetChainId: number
  ): Promise<void> => {
    if (hash === '0x0') return; // Skip if no hash (already approved)
    
    // Create client for the target chain
    const rpcUrl = targetChainId === BSC_CHAIN_ID 
      ? chainsConfig.bsc.rpcUrl 
      : chainsConfig.dsc.rpcUrl;
    
    const client = createPublicClient({
      chain: targetChainId === BSC_CHAIN_ID ? bsc : {
        id: 1555,
        name: 'DSC Chain',
        nativeCurrency: { name: 'DSC', symbol: 'DSC', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    });
    
    // Wait for receipt
    await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  }, []);

  // Check order status
  const checkOrderStatus = useCallback(async (
    orderId: bigint
  ): Promise<'open' | 'matched' | 'completed' | 'cancelled'> => {
    try {
      const client = createPublicClient({
        chain: bsc,
        transport: http(chainsConfig.bsc.rpcUrl),
      });
      
      const result = await client.readContract({
        address: chainsConfig.bsc.vaultContract as Address,
        abi: P2PVaultBSCABI,
        functionName: 'getOrder',
        args: [orderId],
      }) as readonly [Address, number, number, bigint, bigint, bigint];
      
      const status = result[1]; // Status is at index 1 (user, status, orderType, amount, filledAmount, expiresAt)
      
      switch (status) {
        case 0: return 'open';
        case 1: return 'matched';
        case 2: return 'completed';
        case 3: return 'cancelled';
        default: return 'open';
      }
    } catch (e) {
      console.error('Error checking order status:', e);
      return 'open';
    }
  }, []);

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
      if (createBuyOrderHook.needsApproval(amount)) {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await createBuyOrderHook.approve(amountWei);
        
        // Wait for approval
        await new Promise(resolve => setTimeout(resolve, 3000));
        await createBuyOrderHook.refetchAllowance();
      }

      // Step 3: Create the buy order
      setTxState({ step: 'creating' });
      await createBuyOrderHook.createBuyOrder(amount);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'APPROVAL_NEEDED') {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await createBuyOrderHook.approve(amountWei);
        return true;
      }
      
      setTxState({ step: 'error', error: errorMessage });
      return false;
    }
  }, [isConnected, chainId, switchChain, createBuyOrderHook]);

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
      if (fillBscOrderHook.needsApproval(amount)) {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await fillBscOrderHook.approve(amountWei);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        await fillBscOrderHook.refetchAllowance();
      }

      // Step 3: Fill the BSC order
      setTxState({ step: 'filling' });
      await fillBscOrderHook.fillBscBuyOrder(bscOrderId, buyer, amount);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'APPROVAL_NEEDED') {
        setTxState({ step: 'approving' });
        const amountWei = parseUnits(amount, 18);
        await fillBscOrderHook.approve(amountWei);
        return true;
      }
      
      setTxState({ step: 'error', error: errorMessage });
      return false;
    }
  }, [isConnected, chainId, switchChain, fillBscOrderHook]);

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
      fullAddress: buyers[i], // Full address for contract calls
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
      fullAddress: sellers[i], // Full address for contract calls
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
    if (createBuyOrderHook.isSuccess) {
      setTxState({ step: 'complete', txHash: createBuyOrderHook.hash, orderId: createBuyOrderHook.orderId ?? undefined });
      bscOrders.refetch();
    }
    if (createBuyOrderHook.error) {
      setTxState({ step: 'error', error: createBuyOrderHook.error.message });
    }
  }, [createBuyOrderHook.isSuccess, createBuyOrderHook.error, createBuyOrderHook.hash, createBuyOrderHook.orderId]);

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
    if (fillBscOrderHook.isSuccess) {
      setTxState({ step: 'settling', txHash: fillBscOrderHook.hash, orderId: fillBscOrderHook.dscOrderId ?? undefined });
      // Trigger settlement notification
      // This would be handled by the bridge relayer in production
    }
    if (fillBscOrderHook.error) {
      setTxState({ step: 'error', error: fillBscOrderHook.error.message });
    }
  }, [fillBscOrderHook.isSuccess, fillBscOrderHook.error, fillBscOrderHook.hash, fillBscOrderHook.dscOrderId]);

  return {
    // State
    txState,
    isConnected,
    chainId,
    address,
    
    // Actions (legacy combined functions)
    handleCreateBuyOrder,
    handleCreateSellOrder,
    handleFillBscOrder,
    handleCancelOrder,
    resetTxState,
    
    // NEW: Step-by-step functions for modal
    switchToChain,
    approveToken,
    fillBscOrder,
    createBuyOrder,
    waitForTransaction,
    checkOrderStatus,
    
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
    isPending: createBuyOrderHook.isPending || createSellOrder.isPending || fillBscOrderHook.isPending,
    isConfirming: createBuyOrderHook.isConfirming || createSellOrder.isConfirming || fillBscOrderHook.isConfirming,
    
    // Chain helpers
    isOnBsc: chainId === BSC_CHAIN_ID,
    isOnDsc: chainId === DSC_CHAIN_ID,
    switchToBsc: () => switchChain({ chainId: BSC_CHAIN_ID }),
    switchToDsc: () => switchChain({ chainId: DSC_CHAIN_ID }),
    
    // Balances (for display)
    bscBalance: createBuyOrderHook.balance ? formatUnits(createBuyOrderHook.balance, 18) : '0',
    dscBalance: createSellOrder.balance ? formatUnits(createSellOrder.balance, 18) : '0',
  };
}

