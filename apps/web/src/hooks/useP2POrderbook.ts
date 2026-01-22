'use client';

// =============================================================================
// P2P Exchange - Orderbook Contract Hooks
// =============================================================================

import { useCallback } from 'react';
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useChainId,
} from 'wagmi';
import type { Address, Hash, Hex } from 'viem';
import { P2POrderbookABI } from '@p2p/shared/abis';
import { getContractAddress } from '@/lib/config';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface OrderParams {
  sellToken: Address;
  sellAmount: bigint;
  buyToken: Address;
  buyAmount: bigint;
  dstChainId: number;
  hashLock: Hash;
  makerTimelock: bigint;
  takerTimelock: bigint;
}

export interface OnChainOrder {
  maker: Address;
  sellToken: Address;
  sellAmount: bigint;
  buyToken: Address;
  buyAmount: bigint;
  srcChainId: bigint;
  dstChainId: bigint;
  hashLock: Hash;
  makerTimelock: bigint;
  takerTimelock: bigint;
  cancelled: boolean;
}

// -----------------------------------------------------------------------------
// Read Hooks
// -----------------------------------------------------------------------------

/**
 * Hook to read an order from the orderbook
 */
export function useOrder(orderId: bigint | undefined, chainId?: number) {
  const currentChainId = useChainId();
  const targetChainId = chainId ?? currentChainId;
  const orderbookAddress = getContractAddress(targetChainId, 'orderbook');

  return useReadContract({
    address: orderbookAddress,
    abi: P2POrderbookABI,
    functionName: 'orders',
    args: orderId !== undefined ? [orderId] : undefined,
    chainId: targetChainId,
    query: {
      enabled: orderId !== undefined,
    },
  });
}

/**
 * Hook to get the total order count
 */
export function useOrderCount(chainId?: number) {
  const currentChainId = useChainId();
  const targetChainId = chainId ?? currentChainId;
  const orderbookAddress = getContractAddress(targetChainId, 'orderbook');

  return useReadContract({
    address: orderbookAddress,
    abi: P2POrderbookABI,
    functionName: 'orderCount',
    chainId: targetChainId,
  });
}

// -----------------------------------------------------------------------------
// Write Hooks
// -----------------------------------------------------------------------------

/**
 * Hook to create an order on the orderbook
 */
export function useCreateOrder() {
  const chainId = useChainId();
  const orderbookAddress = getContractAddress(chainId, 'orderbook');

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const createOrder = useCallback(
    async (params: OrderParams) => {
      writeContract({
        address: orderbookAddress,
        abi: P2POrderbookABI,
        functionName: 'createOrder',
        args: [
          params.sellToken,
          params.sellAmount,
          params.buyToken,
          params.buyAmount,
          BigInt(params.dstChainId),
          params.hashLock,
          params.makerTimelock,
          params.takerTimelock,
        ],
      });
    },
    [orderbookAddress, writeContract]
  );

  return {
    createOrder,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

/**
 * Hook to cancel an order
 */
export function useCancelOrder() {
  const chainId = useChainId();
  const orderbookAddress = getContractAddress(chainId, 'orderbook');

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const cancelOrder = useCallback(
    async (orderId: bigint) => {
      writeContract({
        address: orderbookAddress,
        abi: P2POrderbookABI,
        functionName: 'cancelOrder',
        args: [orderId],
      });
    },
    [orderbookAddress, writeContract]
  );

  return {
    cancelOrder,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

