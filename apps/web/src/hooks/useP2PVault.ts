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

// V2 BscOrder - updated for new contract
export interface BscOrder {
  buyer: Address;
  status: OrderStatus;
  orderType: number;
  amount: bigint;
  filledAmount: bigint;
  expiresAt: bigint;
}

// V2 DscOrder - updated for new contract
export interface DscOrder {
  seller: Address;
  status: OrderStatus;
  orderType: number;
  amount: bigint;
  filledAmount: bigint;
  expiresAt: bigint;
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
 * Hook to read BSC orders (V2)
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

  // V2 getOrder returns: user, status, orderType, amount, filledAmount, expiresAt
  const order: BscOrder | null = data ? {
    buyer: data[0],
    status: data[1] as OrderStatus,
    orderType: data[2],
    amount: data[3],
    filledAmount: data[4],
    expiresAt: data[5],
  } : null;

  return { order, isLoading, error, refetch };
}

/**
 * Hook to get open buy orders on BSC (V2 - includes remainingAmounts)
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

  // V2 returns: orderIds, users, amounts, remainingAmounts, expiresAts
  const orders = data ? {
    orderIds: data[0],
    buyers: data[1], // Keep as 'buyers' for backward compatibility
    amounts: data[2],
    remainingAmounts: data[3],
    expiresAts: data[4],
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

/**
 * Hook to get user's DSC orders
 */
export function useUserDscOrders(userAddress: Address | undefined) {
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');

  return useReadContract({
    address: vaultAddress,
    abi: P2PVaultDSCABI,
    functionName: 'getUserOrderIds',
    args: userAddress ? [userAddress] : undefined,
    chainId: DSC_CHAIN_ID,
    query: { enabled: !!userAddress },
  });
}

// Status enum values matching contract
const STATUS_MAP: Record<number, string> = {
  0: 'NONE',
  1: 'OPEN',
  2: 'PARTIALLY_FILLED',
  3: 'COMPLETED',
  4: 'CANCELLED',
};

export interface UserOrderWithStatus {
  orderId: bigint;
  chainId: number;
  type: 'buy' | 'sell';
  user: Address;
  status: string;
  amount: bigint;
  filledAmount: bigint;
  expiresAt: bigint;
}

/**
 * Hook to get ALL user orders with their status (for My Orders tab)
 */
export function useAllUserOrders(userAddress: Address | undefined) {
  const [orders, setOrders] = useState<UserOrderWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const bscVault = getContractAddress(BSC_CHAIN_ID, 'vault');
  const dscVault = getContractAddress(DSC_CHAIN_ID, 'vault');
  
  const bscClient = usePublicClient({ chainId: BSC_CHAIN_ID });
  const dscClient = usePublicClient({ chainId: DSC_CHAIN_ID });
  
  const fetchOrders = useCallback(async () => {
    if (!userAddress || !bscClient || !dscClient) {
      setOrders([]);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const allOrders: UserOrderWithStatus[] = [];
      
      // Fetch BSC order IDs
      const bscOrderIds = await bscClient.readContract({
        address: bscVault,
        abi: P2PVaultBSCABI,
        functionName: 'getUserOrderIds',
        args: [userAddress],
      }) as bigint[];
      
      // Fetch each BSC order details
      for (const orderId of bscOrderIds) {
        try {
          const orderData = await bscClient.readContract({
            address: bscVault,
            abi: P2PVaultBSCABI,
            functionName: 'getOrder',
            args: [orderId],
          }) as [Address, number, number, bigint, bigint, bigint];
          
          allOrders.push({
            orderId,
            chainId: BSC_CHAIN_ID,
            type: 'buy',
            user: orderData[0],
            status: STATUS_MAP[orderData[1]] || 'UNKNOWN',
            amount: orderData[3],
            filledAmount: orderData[4],
            expiresAt: orderData[5],
          });
        } catch (e) {
          console.error(`Error fetching BSC order ${orderId}:`, e);
        }
      }
      
      // Fetch DSC order IDs
      const dscOrderIds = await dscClient.readContract({
        address: dscVault,
        abi: P2PVaultDSCABI,
        functionName: 'getUserOrderIds',
        args: [userAddress],
      }) as bigint[];
      
      // Fetch each DSC order details
      for (const orderId of dscOrderIds) {
        try {
          const orderData = await dscClient.readContract({
            address: dscVault,
            abi: P2PVaultDSCABI,
            functionName: 'getOrder',
            args: [orderId],
          }) as [Address, number, number, bigint, bigint, bigint];
          
          allOrders.push({
            orderId,
            chainId: DSC_CHAIN_ID,
            type: 'sell',
            user: orderData[0],
            status: STATUS_MAP[orderData[1]] || 'UNKNOWN',
            amount: orderData[3],
            filledAmount: orderData[4],
            expiresAt: orderData[5],
          });
        } catch (e) {
          console.error(`Error fetching DSC order ${orderId}:`, e);
        }
      }
      
      // Sort by orderId descending (newest first)
      allOrders.sort((a, b) => Number(b.orderId) - Number(a.orderId));
      
      setOrders(allOrders);
    } catch (e) {
      console.error('Error fetching user orders:', e);
      setError(e instanceof Error ? e : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, bscClient, dscClient, bscVault, dscVault]);
  
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);
  
  return { orders, isLoading, error, refetch: fetchOrders };
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
 * Hook to cancel a sell order on DSC (V2 - uses cancelOrder)
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

    // V2 uses cancelOrder (not cancelSellOrder)
    writeContract({
      address: vaultAddress,
      abi: P2PVaultDSCABI,
      functionName: 'cancelOrder',
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
 * Hook to read DSC orders (V2)
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

  // V2 getOrder returns: user, status, orderType, amount, filledAmount, expiresAt
  const order: DscOrder | null = data ? {
    seller: data[0],
    status: data[1] as OrderStatus,
    orderType: data[2],
    amount: data[3],
    filledAmount: data[4],
    expiresAt: data[5],
  } : null;

  return { order, isLoading, error, refetch };
}

/**
 * Hook to get open sell orders on DSC (V2 - includes remainingAmounts)
 */
export function useDscOpenOrders(offset: bigint = 0n, limit: bigint = 50n) {
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');
  
  console.log('useDscOpenOrders - DSC Vault V2:', vaultAddress);

  const { data, isLoading, error, refetch } = useReadContract({
    address: vaultAddress,
    abi: P2PVaultDSCABI,
    functionName: 'getOpenSellOrders',
    args: [offset, limit],
    chainId: DSC_CHAIN_ID,
  });

  // V2 returns: orderIds, users, amounts, remainingAmounts, expiresAts
  const orders = data ? {
    orderIds: data[0],
    sellers: data[1], // Keep as 'sellers' for backward compatibility
    amounts: data[2],
    remainingAmounts: data[3],
    expiresAts: data[4],
  } : null;

  return { orders, isLoading, error, refetch };
}

/**
 * Hook to get DSC order ID for a BSC order (V2)
 */
export function useGetDscOrderForBscOrder(bscOrderId: bigint | undefined) {
  const vaultAddress = getContractAddress(DSC_CHAIN_ID, 'vault');

  return useReadContract({
    address: vaultAddress,
    abi: P2PVaultDSCABI,
    functionName: 'getDscOrderForBscOrder',
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

