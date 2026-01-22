'use client';

// =============================================================================
// P2P Exchange - EIP-712 Order Signing Hook
// =============================================================================

import { useCallback, useState } from 'react';
import { useAccount, useSignTypedData, useChainId } from 'wagmi';
import type { Address, Hex } from 'viem';
import { 
  EIP712_DOMAIN, 
  ORDER_TYPEHASH, 
  type P2POrderData,
  BSC_CHAIN_ID,
  DSC_CHAIN_ID,
} from '@/lib/contracts';

// =============================================================================
// Types
// =============================================================================

export interface SignedOrder {
  order: P2POrderData;
  signature: Hex;
  signer: Address;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for signing P2P orders using EIP-712
 * 
 * The buyer signs the order on BSC before it can be filled on DSC.
 * This signature proves the buyer authorized the cross-chain swap.
 */
export function useOrderSigning() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [signedOrder, setSignedOrder] = useState<SignedOrder | null>(null);
  const [signingError, setSigningError] = useState<Error | null>(null);

  const { signTypedData, isPending: isSigning, reset } = useSignTypedData();

  /**
   * Sign an order using EIP-712
   * 
   * @param orderData - The order data to sign
   * @returns Promise<SignedOrder> - The signed order with signature
   */
  const signOrder = useCallback(async (orderData: P2POrderData): Promise<SignedOrder> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    setSigningError(null);

    return new Promise((resolve, reject) => {
      signTypedData(
        {
          domain: {
            name: EIP712_DOMAIN.name,
            version: EIP712_DOMAIN.version,
            chainId: BigInt(BSC_CHAIN_ID),
            verifyingContract: '0x0000000000000000000000000000000000000000' as Address, // Can be vault address
          },
          types: ORDER_TYPEHASH,
          primaryType: 'P2POrder',
          message: {
            orderId: orderData.orderId,
            buyerBsc: orderData.buyerBsc,
            buyerDscReceiver: orderData.buyerDscReceiver,
            depAmount: orderData.depAmount,
            usdtAmount: orderData.usdtAmount,
            expiry: orderData.expiry,
            srcChainId: orderData.srcChainId,
            dstChainId: orderData.dstChainId,
          },
        },
        {
          onSuccess: (signature) => {
            const signed: SignedOrder = {
              order: orderData,
              signature,
              signer: address,
            };
            setSignedOrder(signed);
            resolve(signed);
          },
          onError: (error) => {
            setSigningError(error);
            reject(error);
          },
        }
      );
    });
  }, [address, signTypedData]);

  /**
   * Create order data for signing
   */
  const createOrderData = useCallback((
    orderId: bigint,
    amount: bigint,
    dscReceiver?: Address,
    expiry?: bigint,
  ): P2POrderData => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    const expiryTime = expiry ?? BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60); // 24 hours

    return {
      orderId,
      buyerBsc: address,
      buyerDscReceiver: dscReceiver ?? address, // Default to same address
      depAmount: amount,
      usdtAmount: amount, // 1:1 rate
      expiry: expiryTime,
      srcChainId: BigInt(BSC_CHAIN_ID),
      dstChainId: BigInt(DSC_CHAIN_ID),
    };
  }, [address]);

  /**
   * Verify a signature (client-side check)
   */
  const verifySignature = useCallback((signedOrder: SignedOrder): boolean => {
    // Basic validation
    if (!signedOrder.signature || signedOrder.signature.length < 130) {
      return false;
    }
    
    // Check signer matches buyer
    if (signedOrder.signer.toLowerCase() !== signedOrder.order.buyerBsc.toLowerCase()) {
      return false;
    }

    // Check expiry
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (signedOrder.order.expiry < now) {
      return false;
    }

    return true;
  }, []);

  /**
   * Store signed order in localStorage for persistence
   */
  const storeSignedOrder = useCallback((order: SignedOrder) => {
    try {
      const key = `p2p-order-${order.order.orderId.toString()}`;
      localStorage.setItem(key, JSON.stringify({
        ...order,
        orderId: order.order.orderId.toString(),
        depAmount: order.order.depAmount.toString(),
        usdtAmount: order.order.usdtAmount.toString(),
        expiry: order.order.expiry.toString(),
        srcChainId: order.order.srcChainId.toString(),
        dstChainId: order.order.dstChainId.toString(),
      }));
    } catch (error) {
      console.error('Failed to store signed order:', error);
    }
  }, []);

  /**
   * Retrieve signed order from localStorage
   */
  const getStoredSignedOrder = useCallback((orderId: bigint): SignedOrder | null => {
    try {
      const key = `p2p-order-${orderId.toString()}`;
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      return {
        signature: parsed.signature,
        signer: parsed.signer,
        order: {
          orderId: BigInt(parsed.orderId),
          buyerBsc: parsed.order.buyerBsc,
          buyerDscReceiver: parsed.order.buyerDscReceiver,
          depAmount: BigInt(parsed.depAmount),
          usdtAmount: BigInt(parsed.usdtAmount),
          expiry: BigInt(parsed.expiry),
          srcChainId: BigInt(parsed.srcChainId),
          dstChainId: BigInt(parsed.dstChainId),
        },
      };
    } catch (error) {
      console.error('Failed to retrieve signed order:', error);
      return null;
    }
  }, []);

  /**
   * Clear stored signed order
   */
  const clearStoredSignedOrder = useCallback((orderId: bigint) => {
    try {
      const key = `p2p-order-${orderId.toString()}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to clear signed order:', error);
    }
  }, []);

  return {
    signOrder,
    createOrderData,
    verifySignature,
    storeSignedOrder,
    getStoredSignedOrder,
    clearStoredSignedOrder,
    signedOrder,
    signingError,
    isSigning,
    reset,
    isOnBsc: chainId === BSC_CHAIN_ID,
  };
}

