'use client';

// =============================================================================
// P2P Exchange - Escrow HTLC Contract Hooks
// =============================================================================

import { useCallback } from 'react';
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
} from 'wagmi';
import type { Address, Hash, Hex } from 'viem';
import { P2PEscrowHTLCABI } from '@p2p/shared/abis';
import { getContractAddress } from '@/lib/config';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface LockParams {
  orderId: bigint;
  recipient: Address;
  token: Address;
  amount: bigint;
  hashLock: Hash;
  timelock: bigint;
}

export interface OnChainLock {
  orderId: bigint;
  depositor: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  hashLock: Hash;
  timelock: bigint;
  claimed: boolean;
  refunded: boolean;
}

// -----------------------------------------------------------------------------
// Read Hooks
// -----------------------------------------------------------------------------

/**
 * Hook to read a lock from the escrow
 */
export function useLock(lockId: Hash | undefined, chainId?: number) {
  const currentChainId = useChainId();
  const targetChainId = chainId ?? currentChainId;
  const escrowAddress = getContractAddress(targetChainId, 'escrow');

  return useReadContract({
    address: escrowAddress,
    abi: P2PEscrowHTLCABI,
    functionName: 'locks',
    args: lockId ? [lockId] : undefined,
    chainId: targetChainId,
    query: {
      enabled: !!lockId,
    },
  });
}

/**
 * Hook to compute a lock ID
 */
export function useComputeLockId(
  orderId: bigint | undefined,
  depositor: Address | undefined,
  hashLock: Hash | undefined,
  chainId?: number
) {
  const currentChainId = useChainId();
  const targetChainId = chainId ?? currentChainId;
  const escrowAddress = getContractAddress(targetChainId, 'escrow');

  return useReadContract({
    address: escrowAddress,
    abi: P2PEscrowHTLCABI,
    functionName: 'getLockId',
    args: orderId && depositor && hashLock ? [orderId, depositor, hashLock] : undefined,
    chainId: targetChainId,
    query: {
      enabled: !!(orderId && depositor && hashLock),
    },
  });
}

/**
 * Hook to check if a lock can be claimed
 */
export function useCanClaim(lockId: Hash | undefined, chainId?: number) {
  const currentChainId = useChainId();
  const targetChainId = chainId ?? currentChainId;
  const escrowAddress = getContractAddress(targetChainId, 'escrow');

  return useReadContract({
    address: escrowAddress,
    abi: P2PEscrowHTLCABI,
    functionName: 'canClaim',
    args: lockId ? [lockId] : undefined,
    chainId: targetChainId,
    query: {
      enabled: !!lockId,
    },
  });
}

/**
 * Hook to check if a lock can be refunded
 */
export function useCanRefund(lockId: Hash | undefined, chainId?: number) {
  const currentChainId = useChainId();
  const targetChainId = chainId ?? currentChainId;
  const escrowAddress = getContractAddress(targetChainId, 'escrow');

  return useReadContract({
    address: escrowAddress,
    abi: P2PEscrowHTLCABI,
    functionName: 'canRefund',
    args: lockId ? [lockId] : undefined,
    chainId: targetChainId,
    query: {
      enabled: !!lockId,
    },
  });
}

// -----------------------------------------------------------------------------
// Write Hooks
// -----------------------------------------------------------------------------

/**
 * Hook to lock tokens in escrow
 */
export function useLockTokens() {
  const chainId = useChainId();
  const escrowAddress = getContractAddress(chainId, 'escrow');

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const lock = useCallback(
    async (params: LockParams) => {
      writeContract({
        address: escrowAddress,
        abi: P2PEscrowHTLCABI,
        functionName: 'lock',
        args: [
          params.orderId,
          params.recipient,
          params.token,
          params.amount,
          params.hashLock,
          params.timelock,
        ],
      });
    },
    [escrowAddress, writeContract]
  );

  return {
    lock,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

/**
 * Hook to claim tokens from escrow
 */
export function useClaimTokens() {
  const chainId = useChainId();
  const escrowAddress = getContractAddress(chainId, 'escrow');

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const claim = useCallback(
    async (lockId: Hash, secret: Hex) => {
      writeContract({
        address: escrowAddress,
        abi: P2PEscrowHTLCABI,
        functionName: 'claim',
        args: [lockId, secret],
      });
    },
    [escrowAddress, writeContract]
  );

  return {
    claim,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

/**
 * Hook to refund tokens from escrow
 */
export function useRefundTokens() {
  const chainId = useChainId();
  const escrowAddress = getContractAddress(chainId, 'escrow');

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const refund = useCallback(
    async (lockId: Hash) => {
      writeContract({
        address: escrowAddress,
        abi: P2PEscrowHTLCABI,
        functionName: 'refund',
        args: [lockId],
      });
    },
    [escrowAddress, writeContract]
  );

  return {
    refund,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

