'use client';

// =============================================================================
// P2P Exchange - Token Approval Hook
// =============================================================================

import { useCallback } from 'react';
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useChainId,
} from 'wagmi';
import type { Address } from 'viem';
import { ERC20ABI } from '@p2p/shared/abis';
import { getContractAddress } from '@/lib/config';

const MAX_UINT256 = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);

/**
 * Hook to manage token approvals for the escrow contract
 */
export function useTokenApproval(tokenAddress: Address | undefined) {
  const chainId = useChainId();
  const { address: userAddress } = useAccount();
  const escrowAddress = getContractAddress(chainId, 'escrow');

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: userAddress && tokenAddress ? [userAddress, escrowAddress] : undefined,
    query: {
      enabled: !!(userAddress && tokenAddress),
    },
  });

  // Write approval
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Approve function
  const approve = useCallback(
    async (amount?: bigint) => {
      if (!tokenAddress) return;

      writeContract({
        address: tokenAddress,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [escrowAddress, amount ?? MAX_UINT256],
      });
    },
    [tokenAddress, escrowAddress, writeContract]
  );

  // Check if approval is needed
  const needsApproval = useCallback(
    (amount: bigint): boolean => {
      if (!allowance) return true;
      return (allowance as bigint) < amount;
    },
    [allowance]
  );

  return {
    allowance: allowance as bigint | undefined,
    approve,
    needsApproval,
    refetchAllowance,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}

/**
 * Hook to read token balance
 */
export function useTokenBalance(tokenAddress: Address | undefined) {
  const { address: userAddress } = useAccount();

  const { data: balance, refetch } = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: userAddress && tokenAddress ? [userAddress] : undefined,
    query: {
      enabled: !!(userAddress && tokenAddress),
    },
  });

  return {
    balance: balance as bigint | undefined,
    refetch,
  };
}

/**
 * Hook to read token info
 */
export function useTokenInfo(tokenAddress: Address | undefined) {
  const chainId = useChainId();

  const { data: symbol } = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'symbol',
    query: {
      enabled: !!tokenAddress,
    },
  });

  const { data: name } = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'name',
    query: {
      enabled: !!tokenAddress,
    },
  });

  const { data: decimals } = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'decimals',
    query: {
      enabled: !!tokenAddress,
    },
  });

  return {
    symbol: symbol as string | undefined,
    name: name as string | undefined,
    decimals: decimals as number | undefined,
  };
}

