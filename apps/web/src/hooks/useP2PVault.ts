'use client';

// =============================================================================
// P2P Exchange - Vault Contract Hooks
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from 'wagmi';
import { parseUnits, formatUnits, type Address, type Hash } from 'viem';
import {
  P2PVaultBSCABI,
  P2PVaultDSCABI,
  ERC20ABI,
  getContractAddress,
  BSC_CHAIN_ID,
  DSC_CHAIN_ID,
  OrderStatus,
} from '@/lib/contracts';

// =============================================================================
// Types
// =============================================================================

export interface BscOrder {
  buyer: Address;
  status: OrderStatus;
  amount: bigint;
  createdAt: bigint;
  expiresAt: bigint;
  matchedSeller: Address;
  matchedAt: bigint;
  dscTxHash: Hash;
}

export interface DscOrder {
  seller: Address;
  status: OrderStatus;
  orderType: number;
  amount: bigint;
  createdAt: bigint;
  expiresAt: bigint;
  matchedBuyer: Address;
  matchedBscOrderId: bigint;
  matchedAt: bigint;
  bscTxHash: Hash;
}

// =============================================================================
// BSC Vault Hooks (Buy Orders)
// =============================================================================

/**
 * Hook to create a BUY order on BSC (locks BEP20 USDT)
 */
export function useCreateBuyOrder() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  
  const vaultAddress = getContractAddress(BSC_CHAIN_ID, 'vault');
  const usdtAddress = getContractAddress(BSC_CHAIN_ID, 'usdt');

  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdtAddress,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: address ? [address, vaultAddress] : undefined,
    chainId: BSC_CHAIN_ID,
  });

  // Check balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdtAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: BSC_CHAIN_ID,
  });

  // Approve USDT
  const approve = useCallback(async (amount: bigint) => {
    if (chainId !== BSC_CHAIN_ID) {
      await switchChain({ chainId: BSC_CHAIN_ID });
      return;
    }
    
    writeContract({
      address: usdtAddress,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [vaultAddress, amount],
    });
  }, [chainId, switchChain, writeContract, usdtAddress, vaultAddress]);

  // Create buy order
  const createBuyOrder = useCallback(async (amount: string) => {
    if (chainId !== BSC_CHAIN_ID) {
      await switchChain({ chainId: BSC_CHAIN_ID });
      return;
    }

    const amountWei = parseUnits(amount, 18);
    
    // Check allowance first
    if (allowance !== undefined && allowance < amountWei) {
      // Need approval first
      throw new Error('APPROVAL_NEEDED');
    }

    writeContract({
      address: vaultAddress,
      abi: P2PVaultBSCABI,
      functionName: 'createBuyOrder',
      args: [amountWei],
    });
  }, [chainId, switchChain, writeContract, vaultAddress, allowance]);

  // Extract orderId from receipt events
  const [orderId, setOrderId] = useState<bigint | null>(null);
  useEffect(() => {
    if (receipt?.logs) {
      // Look for OrderCreated event
      for (const log of receipt.logs) {
        if (log.topics[0] === '0x' && log.topics[1]) {
          // Parse orderId from event (first indexed param)
          const parsedOrderId = BigInt(log.topics[1]);
          setOrderId(parsedOrderId);
          break;
        }
      }
    }
  }, [receipt]);

  return {
    createBuyOrder,
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
    allowance,
    balance,
    refetchAllowance,
    refetchBalance,
    orderId,
    needsApproval: (amount: string) => {
      const amountWei = parseUnits(amount, 18);
      return allowance !== undefined && allowance < amountWei;
    },
  };
}

/**
 * Hook to cancel an order on BSC
 */
export function useCancelBscOrder() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  
  const vaultAddress = getContractAddress(BSC_CHAIN_ID, 'vault');

  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancelOrder = useCallback(async (orderId: bigint) => {
    if (chainId !== BSC_CHAIN_ID) {
      await switchChain({ chainId: BSC_CHAIN_ID });
      return;
    }

    writeContract({
      address: vaultAddress,
      abi: P2PVaultBSCABI,
      functionName: 'cancelOrder',
      args: [orderId],
    });
  }, [chainId, switchChain, writeContract, vaultAddress]);

  return {
    cancelOrder,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

/**
 * Hook to read BSC orders
 */
export function useBscOrder(orderId: bigint | undefined) {
  const vaultAddress = getContractAddress(BSC_CHAIN_ID, 'vault');

  const { data, isLoading, error, refetch } = useReadContract({
    address: vaultAddress,
    abi: P2PVaultBSCABI,
    functionName: 'getOrder',
    args: orderId !== undefined ? [orderId] : undefined,
    chainId: BSC_CHAIN_ID,
    query: { enabled: orderId !== undefined },
  });

  const order: BscOrder | null = data ? {
    buyer: data[0],
    status: data[1] as OrderStatus,
    amount: data[2],
    createdAt: data[3],
    expiresAt: data[4],
    matchedSeller: data[5],
    matchedAt: data[6],
    dscTxHash: data[7],
  } : null;

  return { order, isLoading, error, refetch };
}

/**
 * Hook to get open buy orders on BSC
 */
export function useBscOpenOrders(offset: bigint = 0n, limit: bigint = 50n) {
  const vaultAddress = getContractAddress(BSC_CHAIN_ID, 'vault');

  const { data, isLoading, error, refetch } = useReadContract({
    address: vaultAddress,
    abi: P2PVaultBSCABI,
    functionName: 'getOpenOrders',
    args: [offset, limit],
    chainId: BSC_CHAIN_ID,
  });

  const orders = data ? {
    orderIds: data[0],
    buyers: data[1],
    amounts: data[2],
    expiresAts: data[3],
  } : null;

  return { orders, isLoading, error, refetch };
}

/**
 * Hook to get user's BSC orders
 */
export function useUserBscOrders(userAddress: Address | undefined) {
  const vaultAddress = getContractAddress(BSC_CHAIN_ID, 'vault');

  return useReadContract({
    address: vaultAddress,
    abi: P2PVaultBSCABI,
    functionName: 'getUserOrderIds',
    args: userAddress ? [userAddress] : undefined,
    chainId: BSC_CHAIN_ID,
    query: { enabled: !!userAddress },
  });
}

// =============================================================================
// DSC Vault Hooks (Sell Orders / Fill Orders)
// =============================================================================

/**
 * Hook to fill a BSC buy order on DSC (seller locks DEP20 USDT)
 */
export function useFillBscOrder() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');
  const usdtAddress = getContractAddress(DSC_CHAIN_ID, 'usdt');

  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdtAddress,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: address ? [address, vaultAddress] : undefined,
    chainId: DSC_CHAIN_ID,
  });

  // Check balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdtAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: DSC_CHAIN_ID,
  });

  // Approve DEP20 USDT
  const approve = useCallback(async (amount: bigint) => {
    if (chainId !== DSC_CHAIN_ID) {
      await switchChain({ chainId: DSC_CHAIN_ID });
      return;
    }
    
    writeContract({
      address: usdtAddress,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [vaultAddress, amount],
    });
  }, [chainId, switchChain, writeContract, usdtAddress, vaultAddress]);

  // Fill BSC buy order
  const fillBscBuyOrder = useCallback(async (
    bscOrderId: bigint,
    buyer: Address,
    amount: string
  ) => {
    if (chainId !== DSC_CHAIN_ID) {
      await switchChain({ chainId: DSC_CHAIN_ID });
      return;
    }

    const amountWei = parseUnits(amount, 18);
    
    // Check allowance first
    if (allowance !== undefined && allowance < amountWei) {
      throw new Error('APPROVAL_NEEDED');
    }

    writeContract({
      address: vaultAddress,
      abi: P2PVaultDSCABI,
      functionName: 'fillBscBuyOrder',
      args: [bscOrderId, buyer, amountWei],
    });
  }, [chainId, switchChain, writeContract, vaultAddress, allowance]);

  // Extract orderId from receipt
  const [dscOrderId, setDscOrderId] = useState<bigint | null>(null);
  useEffect(() => {
    if (receipt?.logs) {
      for (const log of receipt.logs) {
        if (log.topics[0] && log.topics[1]) {
          const parsedOrderId = BigInt(log.topics[1]);
          setDscOrderId(parsedOrderId);
          break;
        }
      }
    }
  }, [receipt]);

  return {
    fillBscBuyOrder,
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
    allowance,
    balance,
    refetchAllowance,
    refetchBalance,
    dscOrderId,
    needsApproval: (amount: string) => {
      const amountWei = parseUnits(amount, 18);
      return allowance !== undefined && allowance < amountWei;
    },
  };
}

/**
 * Hook to create a SELL order on DSC (locks DEP20 USDT)
 */
export function useCreateSellOrder() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');
  const usdtAddress = getContractAddress(DSC_CHAIN_ID, 'usdt');

  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdtAddress,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: address ? [address, vaultAddress] : undefined,
    chainId: DSC_CHAIN_ID,
  });

  // Check balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdtAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: DSC_CHAIN_ID,
  });

  // Approve DEP20 USDT
  const approve = useCallback(async (amount: bigint) => {
    if (chainId !== DSC_CHAIN_ID) {
      await switchChain({ chainId: DSC_CHAIN_ID });
      return;
    }
    
    writeContract({
      address: usdtAddress,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [vaultAddress, amount],
    });
  }, [chainId, switchChain, writeContract, usdtAddress, vaultAddress]);

  // Create sell order
  const createSellOrder = useCallback(async (amount: string) => {
    if (chainId !== DSC_CHAIN_ID) {
      await switchChain({ chainId: DSC_CHAIN_ID });
      return;
    }

    const amountWei = parseUnits(amount, 18);
    
    if (allowance !== undefined && allowance < amountWei) {
      throw new Error('APPROVAL_NEEDED');
    }

    writeContract({
      address: vaultAddress,
      abi: P2PVaultDSCABI,
      functionName: 'createSellOrder',
      args: [amountWei],
    });
  }, [chainId, switchChain, writeContract, vaultAddress, allowance]);

  return {
    createSellOrder,
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
    allowance,
    balance,
    refetchAllowance,
    refetchBalance,
    needsApproval: (amount: string) => {
      const amountWei = parseUnits(amount, 18);
      return allowance !== undefined && allowance < amountWei;
    },
  };
}

/**
 * Hook to cancel a sell order on DSC
 */
export function useCancelDscOrder() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');

  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancelSellOrder = useCallback(async (orderId: bigint) => {
    if (chainId !== DSC_CHAIN_ID) {
      await switchChain({ chainId: DSC_CHAIN_ID });
      return;
    }

    writeContract({
      address: vaultAddress,
      abi: P2PVaultDSCABI,
      functionName: 'cancelSellOrder',
      args: [orderId],
    });
  }, [chainId, switchChain, writeContract, vaultAddress]);

  return {
    cancelSellOrder,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

/**
 * Hook to read DSC orders
 */
export function useDscOrder(orderId: bigint | undefined) {
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');

  const { data, isLoading, error, refetch } = useReadContract({
    address: vaultAddress,
    abi: P2PVaultDSCABI,
    functionName: 'getOrder',
    args: orderId !== undefined ? [orderId] : undefined,
    chainId: DSC_CHAIN_ID,
    query: { enabled: orderId !== undefined },
  });

  const order: DscOrder | null = data ? {
    seller: data[0],
    status: data[1] as OrderStatus,
    orderType: data[2],
    amount: data[3],
    createdAt: data[4],
    expiresAt: data[5],
    matchedBuyer: data[6],
    matchedBscOrderId: data[7],
    matchedAt: data[8],
    bscTxHash: data[9],
  } : null;

  return { order, isLoading, error, refetch };
}

/**
 * Hook to get open sell orders on DSC
 */
export function useDscOpenOrders(offset: bigint = 0n, limit: bigint = 50n) {
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');

  const { data, isLoading, error, refetch } = useReadContract({
    address: vaultAddress,
    abi: P2PVaultDSCABI,
    functionName: 'getOpenSellOrders',
    args: [offset, limit],
    chainId: DSC_CHAIN_ID,
  });

  const orders = data ? {
    orderIds: data[0],
    sellers: data[1],
    amounts: data[2],
    expiresAts: data[3],
  } : null;

  return { orders, isLoading, error, refetch };
}

/**
 * Hook to check if BSC order is already matched on DSC
 */
export function useIsBscOrderMatched(bscOrderId: bigint | undefined) {
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');

  return useReadContract({
    address: vaultAddress,
    abi: P2PVaultDSCABI,
    functionName: 'isBscOrderMatched',
    args: bscOrderId !== undefined ? [bscOrderId] : undefined,
    chainId: DSC_CHAIN_ID,
    query: { enabled: bscOrderId !== undefined },
  });
}

// =============================================================================
// Combined Order Management Hook
// =============================================================================

export function useP2POrders() {
  const { address } = useAccount();
  const chainId = useChainId();

  // BSC hooks
  const bscOpenOrders = useBscOpenOrders();
  const userBscOrders = useUserBscOrders(address);
  
  // DSC hooks
  const dscOpenOrders = useDscOpenOrders();

  return {
    bscOpenOrders,
    dscOpenOrders,
    userBscOrders,
    isOnBsc: chainId === BSC_CHAIN_ID,
    isOnDsc: chainId === DSC_CHAIN_ID,
    refetchAll: () => {
      bscOpenOrders.refetch();
      dscOpenOrders.refetch();
      if (userBscOrders.refetch) userBscOrders.refetch();
    },
  };
}

