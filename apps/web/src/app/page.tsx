'use client';

// =============================================================================
// P2P Exchange - Home Page with Buy/Sell Tabs
// Production Version - Uses real data from blockchain & database
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits } from 'viem';
import { useP2PIntegration, type UIOrder } from '@/hooks/useP2PIntegration';
import { useDbOrders, useDbStats, type Order, type Stats } from '@/hooks/useDatabase';
import { useCancelBscOrder, useCancelDscOrder, useAllUserOrders, type UserOrderWithStatus } from '@/hooks/useP2PVault';
import { getContractAddress, BSC_CHAIN_ID, DSC_CHAIN_ID } from '@/lib/contracts';

// =============================================================================
// Create Order Modal Component
// =============================================================================

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateOrder?: (type: 'buy' | 'sell', amount: string) => Promise<void>;
  onSuccess?: () => void;
}

const FIXED_PRICE = '1.00'; // Fixed price $1

function CreateOrderModal({ isOpen, onClose, onSuccess }: CreateOrderModalProps) {
  const { isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  
  // Form state
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  
  // Transaction state
  const [currentStep, setCurrentStep] = useState<'form' | 'approving' | 'creating' | 'done' | 'error'>('form');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Approval transaction
  const { 
    data: approveHash, 
    writeContractAsync: writeApproveAsync, 
    isPending: isApprovePending,
    reset: resetApprove 
  } = useWriteContract();
  
  const { 
    isLoading: isApproveConfirming, 
    isSuccess: isApproveSuccess 
  } = useWaitForTransactionReceipt({ hash: approveHash });
  
  // Create order transaction
  const { 
    data: createHash, 
    writeContractAsync: writeCreateAsync, 
    isPending: isCreatePending,
    reset: resetCreate 
  } = useWriteContract();
  
  const { 
    isLoading: isCreateConfirming, 
    isSuccess: isCreateSuccess 
  } = useWaitForTransactionReceipt({ hash: createHash });
  
  // Contract addresses based on order type
  const isBuyOrder = orderType === 'buy';
  const targetChainId = isBuyOrder ? BSC_CHAIN_ID : DSC_CHAIN_ID;
  const vaultAddress = getContractAddress(targetChainId, 'vault');
  const usdtAddress = getContractAddress(targetChainId, 'usdt');
  const amountWei = amount ? parseUnits(amount, 18) : BigInt(0);
  
  // DEBUG: Log addresses when modal opens
  console.log('CreateOrderModal - Addresses:', {
    orderType,
    targetChainId,
    vaultAddress,
    usdtAddress,
    expectedDscVault: '0xb4e3Ce07DD861dC10da09Ef7574A07b73470D99d',
  });
  
  // Watch for approval success -> auto trigger create
  useEffect(() => {
    if (approveHash && isApproveSuccess && currentStep === 'approving') {
      console.log('Approval confirmed, creating order...');
      setTimeout(() => triggerCreateOrder(), 1000);
    }
  }, [approveHash, isApproveSuccess, currentStep]);
  
  // Watch for create success
  useEffect(() => {
    if (createHash && isCreateSuccess && currentStep === 'creating') {
      console.log('Order created!');
      setCurrentStep('done');
      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    }
  }, [createHash, isCreateSuccess, currentStep]);
  
  // Reset modal state
  const resetModal = () => {
    setOrderType('buy');
    setAmount('');
    setCurrentStep('form');
    setErrorMessage('');
    resetApprove();
    resetCreate();
  };
  
  // Handle Enable button click
  const handleEnable = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      setErrorMessage('Please enter a valid amount');
      setCurrentStep('error');
      return;
    }
    
    try {
      // Switch chain if needed
      if (chainId !== targetChainId) {
        console.log('Switching to chain:', targetChainId);
        await switchChainAsync({ chainId: targetChainId });
        await new Promise(r => setTimeout(r, 1500));
      }
      
      setCurrentStep('approving');
      console.log('Approving...', { usdtAddress, vaultAddress, amount: amountWei.toString() });
      
      const txHash = await writeApproveAsync({
        address: usdtAddress,
        abi: [
          {
            type: 'function',
            name: 'approve',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'approve',
        args: [vaultAddress, amountWei],
        chainId: targetChainId,
      });
      
      console.log('Approve tx hash:', txHash);
      
    } catch (e: unknown) {
      console.error('Approval error:', e);
      const errorMsg = e instanceof Error ? e.message : 'Approval failed';
      if (errorMsg.includes('rejected')) {
        setErrorMessage('Transaction cancelled by user');
      } else {
        setErrorMessage(errorMsg.slice(0, 150));
      }
      setCurrentStep('error');
    }
  };
  
  // Trigger create order transaction
  const triggerCreateOrder = async () => {
    try {
      setCurrentStep('creating');
      console.log('Creating order...', { vaultAddress, amount: amountWei.toString(), orderType });
      
      let txHash: `0x${string}`;
      
      if (isBuyOrder) {
        // Create buy order on BSC
        txHash = await writeCreateAsync({
          address: vaultAddress,
          abi: [
            {
              type: 'function',
              name: 'createBuyOrder',
              inputs: [{ name: 'amount', type: 'uint256' }],
              outputs: [{ name: 'orderId', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'createBuyOrder',
          args: [amountWei],
          chainId: targetChainId,
        });
      } else {
        // Create sell order on DSC
        txHash = await writeCreateAsync({
          address: vaultAddress,
          abi: [
            {
              type: 'function',
              name: 'createSellOrder',
              inputs: [{ name: 'amount', type: 'uint256' }],
              outputs: [{ name: 'orderId', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'createSellOrder',
          args: [amountWei],
          chainId: targetChainId,
        });
      }
      
      console.log('Create order tx hash:', txHash);
      
    } catch (e: unknown) {
      console.error('Create order error:', e);
      const errorMsg = e instanceof Error ? e.message : 'Create order failed';
      if (errorMsg.includes('rejected')) {
        setErrorMessage('Transaction cancelled by user');
      } else {
        setErrorMessage(errorMsg.slice(0, 150));
      }
      setCurrentStep('error');
    }
  };
  
  const handleClose = () => {
    if (currentStep === 'form' || currentStep === 'done' || currentStep === 'error') {
      resetModal();
      onClose();
    }
  };
  
  const handleRetry = () => {
    resetApprove();
    resetCreate();
    setCurrentStep('form');
    setErrorMessage('');
  };

  if (!isOpen) return null;

  const numAmount = parseFloat(amount || '0');
  const totalValue = (numAmount * parseFloat(FIXED_PRICE)).toFixed(2);
  const isProcessing = currentStep === 'approving' || currentStep === 'creating';
  
  // Step status helpers
  const getEnableStatus = () => {
    if (currentStep === 'form') return 'ready';
    if (currentStep === 'approving') {
      if (isApprovePending) return 'signing';
      if (approveHash && isApproveConfirming) return 'confirming';
      return 'signing';
    }
    if (['creating', 'done'].includes(currentStep)) return 'done';
    return 'pending';
  };
  
  const getCreateStatus = () => {
    if (['form', 'approving'].includes(currentStep)) return 'pending';
    if (currentStep === 'creating') {
      if (isCreatePending) return 'signing';
      if (createHash && isCreateConfirming) return 'confirming';
      return 'signing';
    }
    if (currentStep === 'done') return 'done';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isProcessing ? handleClose : undefined}
      />
      
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {currentStep === 'form' ? 'Create Order' : isBuyOrder ? '🟢 Creating Buy Order' : '🔴 Creating Sell Order'}
          </h2>
          {!isProcessing && (
            <button onClick={handleClose} className="text-muted hover:text-white">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Form Step */}
        {currentStep === 'form' && (
          <>
            {/* Order Type Selection */}
            <div className="mb-5">
              <label className="block text-sm text-muted mb-3">I want to</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrderType('buy')}
                  className={`py-4 rounded-xl font-bold text-lg transition-all ${
                    orderType === 'buy'
                      ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                      : 'bg-surface-light text-muted border border-white/5'
                  }`}
                >
                  🟢 BUY DEP20
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('sell')}
                  className={`py-4 rounded-xl font-bold text-lg transition-all ${
                    orderType === 'sell'
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : 'bg-surface-light text-muted border border-white/5'
                  }`}
                >
                  🔴 SELL DEP20
                </button>
              </div>
            </div>

            {/* Transaction Flow */}
            <div className={`mb-5 p-3 rounded-xl border ${isBuyOrder ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center justify-between text-sm">
                <div className="text-center flex-1">
                  <div className="text-muted text-xs mb-1">You Pay</div>
                  <div className="flex items-center justify-center gap-2">
                    <img 
                      src={isBuyOrder ? '/images/usdt-bep20.png' : '/images/dsc-logo.png'} 
                      alt={isBuyOrder ? 'BEP20' : 'DEP20'} 
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-white font-medium">{isBuyOrder ? 'BEP20' : 'DEP20'}</span>
                  </div>
                  <div className="text-xs text-muted">{isBuyOrder ? 'BSC Chain' : 'DSC Chain'}</div>
                </div>
                <div className="text-2xl px-2">→</div>
                <div className="text-center flex-1">
                  <div className="text-muted text-xs mb-1">You Receive</div>
                  <div className="flex items-center justify-center gap-2">
                    <img 
                      src={isBuyOrder ? '/images/dsc-logo.png' : '/images/usdt-bep20.png'} 
                      alt={isBuyOrder ? 'DEP20' : 'BEP20'} 
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-white font-medium">{isBuyOrder ? 'DEP20' : 'BEP20'}</span>
                  </div>
                  <div className="text-xs text-muted">{isBuyOrder ? 'DSC Chain' : 'BSC Chain'}</div>
                </div>
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-5">
              <label className="block text-sm text-muted mb-2">Amount</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  className="w-full bg-surface-light border border-white/10 rounded-xl px-4 py-3 pr-20 text-white text-lg focus:outline-none focus:border-primary"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-medium">USDT</span>
              </div>
            </div>

            {/* Summary */}
            {numAmount > 0 && (
              <div className="mb-5 p-3 bg-surface-light rounded-xl text-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted">You Pay</span>
                  <div className="flex items-center gap-2">
                    <img 
                      src={isBuyOrder ? '/images/usdt-bep20.png' : '/images/dsc-logo.png'} 
                      alt="" 
                      className="w-5 h-5 rounded-full"
                    />
                    <span className="text-white font-medium">{numAmount} {isBuyOrder ? 'BEP20' : 'DEP20'} USDT</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">You Receive</span>
                  <div className="flex items-center gap-2">
                    <img 
                      src={isBuyOrder ? '/images/dsc-logo.png' : '/images/usdt-bep20.png'} 
                      alt="" 
                      className="w-5 h-5 rounded-full"
                    />
                    <span className="text-white font-medium">{numAmount} {isBuyOrder ? 'DEP20' : 'BEP20'} USDT</span>
                  </div>
                </div>
              </div>
            )}

            {/* Create Button */}
            {!isConnected ? (
              <button
                onClick={() => openConnectModal?.()}
                className="w-full py-4 rounded-xl font-bold text-lg bg-primary hover:bg-primary/80 text-white"
              >
                Connect Wallet
              </button>
            ) : (
              <button
                onClick={handleEnable}
                disabled={!amount || parseFloat(amount) <= 0}
                className={`w-full py-4 rounded-xl font-bold text-lg disabled:opacity-50 ${
                  isBuyOrder ? 'bg-green-500 hover:bg-green-400 text-white' : 'bg-red-500 hover:bg-red-400 text-white'
                }`}
              >
                {`Create ${isBuyOrder ? 'Buy' : 'Sell'} Order`}
              </button>
            )}
          </>
        )}

        {/* Processing Steps */}
        {(currentStep === 'approving' || currentStep === 'creating' || currentStep === 'done') && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-surface-light rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-white">{numAmount} USDT</div>
              <div className="text-sm text-muted">{isBuyOrder ? 'Buy' : 'Sell'} Order</div>
            </div>
            
            {/* Step 1: Enable */}
            <div className={`p-4 rounded-lg border-2 ${
              getEnableStatus() === 'done' ? 'border-green-500/50 bg-green-500/10' 
              : getEnableStatus() === 'signing' || getEnableStatus() === 'confirming' ? 'border-primary/50 bg-primary/10'
              : 'border-white/10 bg-surface-light'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  getEnableStatus() === 'done' ? 'bg-green-500 text-white' : 'bg-surface text-muted'
                }`}>
                  {getEnableStatus() === 'done' ? '✓' : '1'}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">Enable {isBuyOrder ? 'BEP20' : 'DEP20'}</div>
                  <div className="text-xs text-muted">
                    {getEnableStatus() === 'signing' && '🔐 Sign in wallet...'}
                    {getEnableStatus() === 'confirming' && '⏳ Confirming...'}
                    {getEnableStatus() === 'done' && '✅ Approved'}
                    {getEnableStatus() === 'ready' && 'Approve token spending'}
                  </div>
                </div>
                {(getEnableStatus() === 'signing' || getEnableStatus() === 'confirming') && (
                  <svg className="animate-spin w-5 h-5 text-primary" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Step 2: Create Order */}
            <div className={`p-4 rounded-lg border-2 ${
              getCreateStatus() === 'done' ? 'border-green-500/50 bg-green-500/10' 
              : getCreateStatus() === 'signing' || getCreateStatus() === 'confirming' ? 'border-primary/50 bg-primary/10'
              : 'border-white/10 bg-surface-light opacity-50'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  getCreateStatus() === 'done' ? 'bg-green-500 text-white' : 'bg-surface text-muted'
                }`}>
                  {getCreateStatus() === 'done' ? '✓' : '2'}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">Create Order</div>
                  <div className="text-xs text-muted">
                    {getCreateStatus() === 'signing' && '🔐 Sign in wallet...'}
                    {getCreateStatus() === 'confirming' && '⏳ Confirming...'}
                    {getCreateStatus() === 'done' && '✅ Order Created'}
                    {getCreateStatus() === 'pending' && 'Waiting for approval...'}
                  </div>
                </div>
                {(getCreateStatus() === 'signing' || getCreateStatus() === 'confirming') && (
                  <svg className="animate-spin w-5 h-5 text-primary" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
              </div>
            </div>

            {/* Success */}
            {currentStep === 'done' && (
              <div className="p-4 bg-green-500/20 rounded-lg text-center">
                <div className="text-3xl mb-2">🎉</div>
                <div className="text-green-400 font-bold text-lg">Order Created!</div>
                <div className="text-sm text-muted mt-1">Your {isBuyOrder ? 'buy' : 'sell'} order is now live</div>
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {currentStep === 'error' && (
          <div className="p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10">
            <div className="text-red-400 font-medium mb-2">Transaction Failed</div>
            <div className="text-xs text-red-400/70 mb-3">{errorMessage}</div>
            <button onClick={handleRetry} className="w-full py-2 rounded-lg font-medium text-white bg-red-500">
              Try Again
            </button>
          </div>
        )}

        {/* Done Button */}
        {currentStep === 'done' && (
          <button
            onClick={handleClose}
            className="w-full mt-4 py-3 rounded-xl font-bold text-white bg-green-500 hover:bg-green-400"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Constants
// =============================================================================
const ORDERS_PER_PAGE = 50;

// =============================================================================
// Trade Confirmation Modal - Compact design with proper scrolling
// =============================================================================

interface TradeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: number;
    orderId?: bigint | string | number;
    userAddress: string;
    fullAddress?: string;
    amount: string;
    timestamp: number;
    type: 'buy' | 'sell';
    price: string;
  } | null;
  tradeType: 'buy' | 'sell';
  onTradeSuccess?: () => void;
}

// Inner component that uses hooks
function TradeConfirmModalInner({ 
  order, 
  tradeType, 
  onClose, 
  onTradeSuccess 
}: { 
  order: NonNullable<TradeConfirmModalProps['order']>;
  tradeType: 'buy' | 'sell';
  onClose: () => void;
  onTradeSuccess?: () => void;
}) {
  const { isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  
  // Step tracking: idle -> approving -> filling -> waiting -> done
  const [currentStep, setCurrentStep] = useState<'idle' | 'approving' | 'filling' | 'waiting' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [approvalStarted, setApprovalStarted] = useState(false);
  const [fillStarted, setFillStarted] = useState(false);
  
  // Approval transaction
  const { 
    data: approveHash, 
    writeContractAsync: writeApproveAsync, 
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove 
  } = useWriteContract();
  
  const { 
    isLoading: isApproveConfirming, 
    isSuccess: isApproveSuccess 
  } = useWaitForTransactionReceipt({ hash: approveHash });
  
  // Fill transaction
  const { 
    data: fillHash, 
    writeContractAsync: writeFillAsync, 
    isPending: isFillPending,
    error: fillError,
    reset: resetFill 
  } = useWriteContract();
  
  const { 
    isLoading: isFillConfirming, 
    isSuccess: isFillSuccess 
  } = useWaitForTransactionReceipt({ hash: fillHash });
  
  // Contract addresses - use getContractAddress for proper config
  // When clicking SELL on a BSC buy order -> fill on DSC (send DEP20, get BEP20)
  // When clicking BUY on a DSC sell order -> create buy order on BSC (send BEP20, get DEP20)
  const isFillingBuyOrder = tradeType === 'sell'; // SELL button fills BSC buy order
  const targetChainId = isFillingBuyOrder ? DSC_CHAIN_ID : BSC_CHAIN_ID;
  const vaultAddress = getContractAddress(targetChainId, 'vault');
  const usdtAddress = getContractAddress(targetChainId, 'usdt');
  
  // Log addresses for debugging
  console.log('Trade modal using addresses:', { 
    tradeType,
    orderType: order.type,
    isFillingBuyOrder,
    targetChainId, 
    vaultAddress, 
    usdtAddress,
  });
  
  const amount = parseFloat(order.amount);
  const amountWei = parseUnits(order.amount, 18);
  const payToken = isFillingBuyOrder ? 'DEP20 USDT' : 'BEP20 USDT';
  const payChain = isFillingBuyOrder ? 'DSC' : 'BSC';
  const receiveToken = isFillingBuyOrder ? 'BEP20 USDT' : 'DEP20 USDT';
  const receiveChain = isFillingBuyOrder ? 'BSC' : 'DSC';
  
  // Watch for approval confirmation -> auto trigger fill
  useEffect(() => {
    // Must have a real tx hash (not just success flag)
    if (approveHash && approveHash !== '0x' && isApproveSuccess && currentStep === 'approving' && !fillStarted) {
      console.log('Approval confirmed with hash:', approveHash);
      setFillStarted(true);
      // Small delay to ensure UI updates
      setTimeout(() => triggerFill(), 1000);
    }
  }, [approveHash, isApproveSuccess, currentStep, fillStarted]);
  
  // Watch for fill success
  useEffect(() => {
    // Must have a real tx hash
    if (fillHash && fillHash !== '0x' && isFillSuccess && currentStep === 'filling') {
      console.log('Fill confirmed with hash:', fillHash);
      setCurrentStep('waiting');
      // Poll for relayer completion (in production, actually poll the BSC contract)
      setTimeout(() => {
        setCurrentStep('done');
        setTimeout(() => onTradeSuccess?.(), 2000);
      }, 5000);
    }
  }, [fillHash, isFillSuccess, currentStep]);
  
  // Step 1: Handle Enable button click - ASYNC with proper waiting
  const handleEnable = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    
    // Reset any previous state
    resetApprove();
    resetFill();
    setErrorMessage('');
    setApprovalStarted(true);
    setFillStarted(false);
    
    try {
      // Switch chain if needed
      if (chainId !== targetChainId) {
        console.log('Switching to chain:', targetChainId);
        await switchChainAsync({ chainId: targetChainId });
        await new Promise(r => setTimeout(r, 1500));
      }
      
      setCurrentStep('approving');
      console.log('Calling approve...', { usdtAddress, vaultAddress, amount: amountWei.toString() });
      
      // Validate addresses
      if (!usdtAddress || !vaultAddress) {
        throw new Error('Contract addresses not configured');
      }
      
      // Call approve and WAIT for wallet signature - this opens the wallet popup
      const txHash = await writeApproveAsync({
        address: usdtAddress,
        abi: [
          {
            type: 'function',
            name: 'approve',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'approve',
        args: [vaultAddress, amountWei],
        chainId: targetChainId,
      });
      
      console.log('Approve tx hash:', txHash);
      
      if (!txHash) {
        throw new Error('No transaction hash returned - wallet may have rejected');
      }
      
      // Now we have a tx hash, the useWaitForTransactionReceipt will track confirmation
      console.log('Approve tx submitted, waiting for confirmation...');
      
    } catch (e: unknown) {
      console.error('Approval error:', e);
      const errorMsg = e instanceof Error ? e.message : 'Failed to approve';
      // Check if user rejected
      if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected') || errorMsg.includes('rejected')) {
        setErrorMessage('Transaction cancelled by user');
      } else {
        setErrorMessage(errorMsg.slice(0, 150));
      }
      setCurrentStep('error');
    }
  };
  
  // Step 2: Trigger fill transaction
  const triggerFill = async () => {
    if (!order.orderId || !order.fullAddress) {
      setErrorMessage('Missing order data');
      setCurrentStep('error');
      return;
    }
    
    try {
      setCurrentStep('filling');
      
      const bscOrderId = typeof order.orderId === 'bigint' 
        ? order.orderId 
        : BigInt(order.orderId);
      const buyerAddress = order.fullAddress as `0x${string}`;
      
      console.log('Calling fillBscBuyOrder...', { 
        vaultAddress,
        bscOrderId: bscOrderId.toString(), 
        buyerAddress, 
        amount: amountWei.toString(),
        chainId: targetChainId 
      });
      
      let fillTxHash: `0x${string}`;
      
      if (isFillingBuyOrder) {
        // SELL button clicked -> Fill BSC buy order on DSC (send DEP20)
        fillTxHash = await writeFillAsync({
          address: vaultAddress,
          abi: [
            {
              type: 'function',
              name: 'fillBscBuyOrder',
              inputs: [
                { name: 'bscOrderId', type: 'uint256' },
                { name: 'buyer', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
              outputs: [{ name: 'orderId', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'fillBscBuyOrder',
          args: [bscOrderId, buyerAddress, amountWei],
          chainId: targetChainId,
        });
      } else {
        // BUY button clicked -> Create buy order on BSC (send BEP20)
        // This will be matched with existing DSC sell order by relayer
        fillTxHash = await writeFillAsync({
          address: vaultAddress,
          abi: [
            {
              type: 'function',
              name: 'createBuyOrder',
              inputs: [{ name: 'amount', type: 'uint256' }],
              outputs: [{ name: 'orderId', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'createBuyOrder',
          args: [amountWei],
          chainId: targetChainId,
        });
      }
      
      console.log('Fill tx hash:', fillTxHash);
      
      if (!fillTxHash) {
        throw new Error('No transaction hash returned - wallet may have rejected');
      }
      
      console.log('Fill tx submitted, waiting for confirmation...');
      
    } catch (e: unknown) {
      console.error('Fill error:', e);
      const errorMsg = e instanceof Error ? e.message : 'Fill transaction failed';
      if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected') || errorMsg.includes('rejected')) {
        setErrorMessage('Transaction cancelled by user');
      } else {
        setErrorMessage(errorMsg.slice(0, 150));
      }
      setCurrentStep('error');
    }
  };
  
  const handleClose = () => {
    if (currentStep === 'idle' || currentStep === 'done' || currentStep === 'error') {
      resetApprove();
      resetFill();
      setCurrentStep('idle');
      setErrorMessage('');
      setApprovalStarted(false);
      setFillStarted(false);
      onClose();
    }
  };
  
  const handleRetry = () => {
    resetApprove();
    resetFill();
    setCurrentStep('idle');
    setErrorMessage('');
    setApprovalStarted(false);
    setFillStarted(false);
  };
  
  // Determine step statuses based on current step and tx states
  const getEnableStatus = () => {
    if (currentStep === 'idle') return 'ready';
    if (currentStep === 'approving') {
      if (isApprovePending) return 'signing';
      if (approveHash && isApproveConfirming) return 'confirming';
      if (approveHash && isApproveSuccess) return 'done';
      return 'signing'; // Waiting for wallet
    }
    if (['filling', 'waiting', 'done'].includes(currentStep)) return 'done';
    return 'pending';
  };
  
  const getConfirmStatus = () => {
    if (currentStep === 'idle' || currentStep === 'approving') return 'pending';
    if (currentStep === 'filling') {
      if (isFillPending) return 'signing';
      if (fillHash && isFillConfirming) return 'confirming';
      if (fillHash && isFillSuccess) return 'done';
      return 'signing'; // Waiting for wallet
    }
    if (['waiting', 'done'].includes(currentStep)) return 'done';
    return 'pending';
  };
  
  const getReceiveStatus = () => {
    if (currentStep === 'waiting') return 'waiting';
    if (currentStep === 'done') return 'done';
    return 'pending';
  };
  
  const isProcessing = !['idle', 'done', 'error'].includes(currentStep);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isProcessing ? handleClose : undefined}
      />
      
      <div className="relative bg-surface border border-white/10 rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className={`p-4 border-b border-white/10 flex items-center justify-between ${isFillingBuyOrder ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{isFillingBuyOrder ? '🔴' : '🟢'}</span>
            <h2 className="text-lg font-bold text-white">
              {isFillingBuyOrder ? 'Sell' : 'Buy'} DEP20 USDT
            </h2>
          </div>
          {!isProcessing && (
            <button onClick={handleClose} className="text-muted hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          
          {/* Trade Summary */}
          <div className="bg-surface-light rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="text-xs text-muted mb-1">You Pay</div>
                <div className="flex items-center justify-center gap-2">
                  <img 
                    src={isFillingBuyOrder ? '/images/dsc-logo.png' : '/images/usdt-bep20.png'} 
                    alt={payToken} 
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-lg font-bold text-red-400">{amount}</span>
                </div>
                <div className="text-xs text-muted">{payToken} ({payChain})</div>
              </div>
              <div className="px-3 text-2xl">→</div>
              <div className="text-center flex-1">
                <div className="text-xs text-muted mb-1">You Receive</div>
                <div className="flex items-center justify-center gap-2">
                  <img 
                    src={isFillingBuyOrder ? '/images/usdt-bep20.png' : '/images/dsc-logo.png'} 
                    alt={receiveToken} 
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-lg font-bold text-green-400">{amount}</span>
                </div>
                <div className="text-xs text-muted">{receiveToken} ({receiveChain})</div>
              </div>
            </div>
            {/* Action type indicator */}
            <div className={`mt-3 pt-3 border-t border-white/10 text-center text-xs ${isFillingBuyOrder ? 'text-red-400' : 'text-green-400'}`}>
              {isFillingBuyOrder 
                ? '✅ Direct fill - Instant execution' 
                : '⚡ Creates matching order - Relayer executes in ~30s'}
            </div>
          </div>

          {/* Step 1: Enable */}
          <div className={`p-4 rounded-lg border-2 transition-all ${
            getEnableStatus() === 'done' ? 'border-green-500/50 bg-green-500/10' 
            : getEnableStatus() === 'signing' || getEnableStatus() === 'confirming' ? 'border-primary/50 bg-primary/10'
            : 'border-white/10 bg-surface-light'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                getEnableStatus() === 'done' ? 'bg-green-500 text-white' : 'bg-surface text-muted'
              }`}>
                {getEnableStatus() === 'done' ? '✓' : '1'}
              </div>
              <div className="flex-1">
                <div className="font-medium text-white">Enable {payToken}</div>
                <div className="text-xs text-muted">
                  {getEnableStatus() === 'signing' && '🔐 Sign in wallet...'}
                  {getEnableStatus() === 'confirming' && '⏳ Confirming on chain...'}
                  {getEnableStatus() === 'done' && '✅ Approved'}
                  {getEnableStatus() === 'ready' && 'Approve token spending'}
                </div>
              </div>
              {approveHash && getEnableStatus() === 'confirming' && (
                <a href={`${isFillingBuyOrder ? 'https://dscscan.io' : 'https://bscscan.com'}/tx/${approveHash}`}
                   target="_blank" className="text-xs text-primary">View</a>
              )}
            </div>
            
            {currentStep === 'idle' && (
              !isConnected ? (
                <button
                  onClick={() => openConnectModal?.()}
                  className="w-full mt-3 py-3 rounded-lg font-bold text-white bg-primary hover:bg-primary/80"
                >
                  Connect Wallet
                </button>
              ) : (
                <button
                  onClick={handleEnable}
                  className="w-full mt-3 py-3 rounded-lg font-bold text-white bg-primary hover:bg-primary/80"
                >
                  {`Enable ${payToken}`}
                </button>
              )
            )}
            
            {(getEnableStatus() === 'signing' || getEnableStatus() === 'confirming') && (
              <div className="mt-3 flex items-center justify-center gap-2 text-primary">
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">{getEnableStatus() === 'signing' ? 'Check wallet...' : 'Confirming...'}</span>
              </div>
            )}
          </div>

          {/* Step 2: Confirm */}
          <div className={`p-4 rounded-lg border-2 transition-all ${
            getConfirmStatus() === 'done' ? 'border-green-500/50 bg-green-500/10' 
            : getConfirmStatus() === 'signing' || getConfirmStatus() === 'confirming' ? 'border-primary/50 bg-primary/10'
            : 'border-white/10 bg-surface-light opacity-50'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                getConfirmStatus() === 'done' ? 'bg-green-500 text-white' : 'bg-surface text-muted'
              }`}>
                {getConfirmStatus() === 'done' ? '✓' : '2'}
              </div>
              <div className="flex-1">
                <div className="font-medium text-white">Confirm {isFillingBuyOrder ? 'Sell' : 'Buy'}</div>
                <div className="text-xs text-muted">
                  {getConfirmStatus() === 'signing' && '🔐 Sign in wallet...'}
                  {getConfirmStatus() === 'confirming' && '⏳ Confirming on chain...'}
                  {getConfirmStatus() === 'done' && '✅ Confirmed'}
                  {getConfirmStatus() === 'pending' && 'Waiting for approval...'}
                  {getConfirmStatus() === 'ready' && 'Ready to confirm'}
                </div>
              </div>
              {fillHash && getConfirmStatus() === 'confirming' && (
                <a href={`${isFillingBuyOrder ? 'https://dscscan.io' : 'https://bscscan.com'}/tx/${fillHash}`}
                   target="_blank" className="text-xs text-primary">View</a>
              )}
            </div>
            
            {(getConfirmStatus() === 'signing' || getConfirmStatus() === 'confirming') && (
              <div className="mt-3 flex items-center justify-center gap-2 text-primary">
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">{getConfirmStatus() === 'signing' ? 'Check wallet...' : 'Confirming...'}</span>
              </div>
            )}
          </div>

          {/* Step 3: Receive */}
          <div className={`p-4 rounded-lg border-2 transition-all ${
            getReceiveStatus() === 'done' ? 'border-green-500/50 bg-green-500/10' 
            : getReceiveStatus() === 'waiting' ? 'border-yellow-500/50 bg-yellow-500/10'
            : 'border-white/10 bg-surface-light opacity-50'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                getReceiveStatus() === 'done' ? 'bg-green-500 text-white' : 'bg-surface text-muted'
              }`}>
                {getReceiveStatus() === 'done' ? '✓' : '3'}
              </div>
              <div className="flex-1">
                <div className="font-medium text-white">Receive {receiveToken}</div>
                <div className="text-xs text-muted">
                  {getReceiveStatus() === 'waiting' && '⏳ Relayer completing trade...'}
                  {getReceiveStatus() === 'done' && `✅ ${amount} ${receiveToken} received!`}
                  {getReceiveStatus() === 'pending' && `Automatic via relayer`}
                </div>
              </div>
              {getReceiveStatus() === 'waiting' && (
                <svg className="animate-spin w-5 h-5 text-yellow-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
            
            {getReceiveStatus() === 'done' && (
              <div className="mt-3 p-3 bg-green-500/20 rounded-lg text-center">
                <div className="text-2xl mb-1">🎉</div>
                <div className="text-green-400 font-bold">Trade Complete!</div>
              </div>
            )}
          </div>

          {/* Error */}
          {currentStep === 'error' && (
            <div className="p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10">
              <div className="text-red-400 font-medium mb-2">Transaction Failed</div>
              <div className="text-xs text-red-400/70 mb-3 break-words">{errorMessage}</div>
              <button onClick={handleRetry} className="w-full py-2 rounded-lg font-medium text-white bg-red-500">
                Try Again
              </button>
            </div>
          )}
        </div>

        {currentStep === 'done' && (
          <div className="p-4 border-t border-white/10">
            <button onClick={handleClose} className="w-full py-3 rounded-lg font-bold text-white bg-green-500">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TradeConfirmModal({ isOpen, onClose, order, tradeType, onTradeSuccess }: TradeConfirmModalProps) {
  if (!isOpen || !order) return null;
  
  return (
    <TradeConfirmModalInner 
      order={order} 
      tradeType={tradeType} 
      onClose={onClose} 
      onTradeSuccess={onTradeSuccess} 
    />
  );
}

// =============================================================================
// Cancel Order Confirmation Modal
// =============================================================================

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: number;
    userAddress: string;
    amount: string;
    timestamp: number;
    type: 'buy' | 'sell';
    price: string;
    status?: string;
    orderId?: any;
    dbId?: string;
    chainId?: number;
  } | null;
  onCancelSuccess: () => void;
}

function CancelOrderModal({ isOpen, onClose, order, onCancelSuccess }: CancelOrderModalProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [step, setStep] = useState<'confirm' | 'processing' | 'success' | 'error'>('confirm');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Use cancel hooks directly for BSC and DSC
  const cancelBsc = useCancelBscOrder();
  const cancelDsc = useCancelDscOrder();
  
  // Determine which cancel hook to use based on order type
  const isBscOrder = order?.type === 'buy';
  const cancelHook = isBscOrder ? cancelBsc : cancelDsc;
  const txHash = cancelHook.hash;

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('confirm');
      setErrorMessage('');
      cancelBsc.reset();
      cancelDsc.reset();
    }
  }, [isOpen]);

  // Watch for transaction success
  useEffect(() => {
    if (step === 'processing') {
      if (cancelHook.isSuccess) {
        setStep('success');
        // After 2 seconds, close modal and refresh orders
        setTimeout(() => {
          onCancelSuccess();
          onClose();
        }, 2000);
      } else if (cancelHook.error) {
        setErrorMessage(cancelHook.error.message || 'Transaction failed');
        setStep('error');
      }
    }
  }, [cancelHook.isSuccess, cancelHook.error, step, onCancelSuccess, onClose]);

  if (!isOpen || !order) return null;

  const amount = parseFloat(order.amount);
  const chain = order.type === 'buy' ? 'BSC' : 'DSC';
  const token = order.type === 'buy' ? 'BEP20 USDT' : 'DEP20 USDT';

  const handleConfirmCancel = async () => {
    if (!order.orderId) {
      setErrorMessage('Order ID not found');
      setStep('error');
      return;
    }

    setStep('processing');
    
    try {
      const orderId = BigInt(order.orderId);
      
      console.log('Cancelling order on chain:', chain, 'orderId:', orderId.toString());
      
      // Call the actual smart contract cancel function
      if (isBscOrder) {
        await cancelBsc.cancelOrder(orderId);
      } else {
        await cancelDsc.cancelSellOrder(orderId);
      }
      
      // Transaction submitted, wait for confirmation via useEffect
    } catch (error) {
      console.error('Error cancelling order:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to cancel order');
      setStep('error');
    }
  };

  const handleClose = () => {
    if (step !== 'processing') {
      setStep('confirm');
      cancelBsc.reset();
      cancelDsc.reset();
      onClose();
    }
  };

  // Determine processing status text
  const getProcessingStatus = () => {
    if (cancelHook.isPending) return 'Waiting for wallet approval...';
    if (cancelHook.isConfirming) return 'Confirming on blockchain...';
    return 'Preparing transaction...';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={step === 'confirm' ? handleClose : undefined}
      />
      
      {/* Modal */}
      <div className="relative bg-surface border border-white/10 rounded-xl w-full max-w-md shadow-2xl">
        
        {step === 'confirm' && (
          <>
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-orange-500/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h2 className="text-lg font-bold text-white">Cancel Order</h2>
              </div>
              <button onClick={handleClose} className="text-muted hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Order Details */}
              <div className="bg-surface-light rounded-lg p-4 space-y-3">
                <div className="text-xs text-muted uppercase tracking-wider mb-2">Order Details</div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted">Chain</span>
                  <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                    order.type === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {chain}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted">Amount</span>
                  <div className="flex items-center gap-2">
                    <img 
                      src={order.type === 'buy' ? '/images/usdt-bep20.png' : '/images/dsc-logo.png'} 
                      alt="" 
                      className="w-5 h-5 rounded-full"
                    />
                    <span className="text-white font-semibold">{amount.toLocaleString()} {token}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted">Price</span>
                  <span className="text-white">${order.price}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted">Total Value</span>
                  <span className="text-primary font-bold">${(amount * parseFloat(order.price)).toLocaleString()}</span>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <span className="text-orange-400 text-lg">⚠️</span>
                <div className="text-sm text-orange-200/80">
                  <p className="font-medium mb-1">Are you sure you want to cancel this order?</p>
                  <p className="text-xs text-orange-200/60">Your locked funds will be returned to your wallet after cancellation.</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-surface-light flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-lg font-medium text-muted bg-surface hover:bg-surface-lighter border border-white/10"
              >
                Keep Order
              </button>
              {!isConnected ? (
                <button
                  onClick={() => openConnectModal?.()}
                  className="flex-1 py-3 rounded-lg font-bold text-white bg-primary hover:bg-primary/80"
                >
                  Connect Wallet
                </button>
              ) : (
                <button
                  onClick={handleConfirmCancel}
                  className="flex-1 py-3 rounded-lg font-bold text-white bg-orange-500 hover:bg-orange-400"
                >
                  Confirm Cancel
                </button>
              )}
            </div>
          </>
        )}

        {step === 'processing' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
              <svg className="animate-spin w-8 h-8 text-orange-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Cancelling Order</h3>
            <p className="text-sm text-muted mb-2">{getProcessingStatus()}</p>
            {txHash && (
              <div className="mt-3 p-2 bg-surface rounded-lg">
                <p className="text-xs text-muted mb-1">Transaction Hash:</p>
                <a 
                  href={`${order?.type === 'buy' ? 'https://bscscan.com' : 'https://dscscan.io'}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline break-all"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Order Cancelled!</h3>
            <p className="text-sm text-muted mb-2">Your order has been cancelled successfully.</p>
            <p className="text-xs text-green-400 mb-3">Funds have been returned to your wallet.</p>
            {txHash && (
              <a 
                href={`${order?.type === 'buy' ? 'https://bscscan.com' : 'https://dscscan.io'}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-primary hover:underline"
              >
                View on {order?.type === 'buy' ? 'BSCScan' : 'DSCScan'} →
              </a>
            )}
          </div>
        )}

        {step === 'error' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-3xl">❌</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Cancellation Failed</h3>
            <p className="text-sm text-muted mb-4">{errorMessage || 'Failed to cancel order. Please try again.'}</p>
            <div className="flex gap-2">
              <button onClick={handleClose} className="flex-1 py-3 rounded-lg font-medium text-muted bg-surface border border-white/10">
                Close
              </button>
              <button onClick={() => setStep('confirm')} className="flex-1 py-3 rounded-lg font-bold text-white bg-orange-500">
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Order Row Component - Handles wallet connect on BUY/SELL click
// =============================================================================

interface OrderRowProps {
  order: {
    id: number;
    userAddress: string;
    amount: string;
    timestamp: number;
    type: 'buy' | 'sell';
    price: string;
    status?: string;
  };
  index: number;
  activeTab: 'buy' | 'sell';
  isConnected: boolean;
  isMyOrders: boolean;
  onTradeClick: (order: OrderRowProps['order']) => void;
  onCancelClick?: (order: OrderRowProps['order']) => void;
}

function OrderRow({ order, index, activeTab, isConnected, isMyOrders, onTradeClick, onCancelClick }: OrderRowProps) {
  return (
    <div
      className="px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-white/[0.02] transition-colors"
      style={{ animationDelay: `${index * 20}ms` }}
    >
      {/* User Address + Order Type */}
      <div className="col-span-4 flex items-center gap-2">
        {order.type === 'buy' ? (
          <img 
            src="/images/usdt-bep20.png" 
            alt="BEP20 USDT" 
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <img 
            src="/images/dsc-logo.png" 
            alt="DEP20 USDT" 
            className="w-8 h-8 rounded-full"
          />
        )}
        <div className="flex flex-col">
          <span className="font-mono text-sm text-white/80">
            {order.userAddress}
          </span>
          {isMyOrders && (
            <span className={`text-xs font-bold ${order.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {order.type === 'buy' ? '↓ BUY Order' : '↑ SELL Order'}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="col-span-2 text-right">
        <span className="font-semibold text-white">
          {Number(order.amount).toLocaleString()}
        </span>
        <span className={`text-xs ml-1 ${order.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
          {order.type === 'buy' ? 'BEP20 USDT' : 'DEP20 USDT'}
        </span>
      </div>

      {/* Price */}
      <div className="col-span-2 text-right">
        <span className="text-white/80">${order.price}</span>
      </div>

      {/* Time */}
      <div className="col-span-2 text-center">
        <span className="text-muted text-sm">
          {formatTimeAgo(order.timestamp)}
        </span>
      </div>

      {/* Action Button / Status */}
      <div className="col-span-2 text-center">
        {isMyOrders ? (
          // My Orders - show status or cancel button
          order.status === 'OPEN' ? (
            <button
              onClick={() => onCancelClick?.(order)}
              className="px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20"
            >
              Cancel
            </button>
          ) : order.status === 'COMPLETED' ? (
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500/20 text-green-400">
              Success
            </span>
          ) : order.status === 'CANCELLED' ? (
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400">
              Cancelled
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-500/20 text-gray-400">
              {order.status}
            </span>
          )
        ) : (
          // Public orders - show SELL/BUY button
          <button
            onClick={() => onTradeClick(order)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
              activeTab === 'buy'
                ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20'
                : 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20'
            }`}
          >
            {activeTab === 'buy' ? 'SELL' : 'BUY'}
          </button>
        )}
      </div>
    </div>
  );
}

// Format time ago
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function HomePage() {
  const { isConnected, address } = useAccount();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'success' | 'cancel'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const listRef = useRef<HTMLDivElement>(null);
  
  // =============================================================================
  // Real Data Hooks - Fetch from blockchain and database
  // =============================================================================
  
  // P2P Integration - Smart contract interactions
  const p2p = useP2PIntegration();
  
  // Fetch ALL user orders for My Orders tab (includes completed/cancelled)
  const { orders: userOrders, isLoading: isLoadingUserOrders, refetch: refetchUserOrders } = useAllUserOrders(address as `0x${string}` | undefined);
  
  // Database hooks for stats
  const { stats, loading: loadingStats } = useDbStats();
  
  // Use BLOCKCHAIN orders directly from smart contract (real-time)
  // p2p.allOrders comes from useP2PIntegration which reads directly from blockchain
  const blockchainOrders = p2p.allOrders || [];
  
  // Map blockchain orders to display format (for public order book)
  const publicOrders = blockchainOrders.map((order, index) => ({
    id: index,
    userAddress: order.userAddress || 'Unknown',
    fullAddress: order.fullAddress || '', // Full address for contract calls
    status: 'OPEN',
    amount: order.amount,
    timestamp: order.timestamp || Date.now(),
    type: order.type as 'buy' | 'sell',
    price: '1.0000',
    orderId: order.orderId,
    dbId: undefined,
    chainId: order.chainId || (order.type === 'buy' ? BSC_CHAIN_ID : DSC_CHAIN_ID),
  }));
  
  // Map user orders to display format (for My Orders tab)
  const myOrders = userOrders.map((order, index) => ({
    id: index,
    userAddress: `${order.user.slice(0, 6)}...${order.user.slice(-4)}`,
    fullAddress: order.user,
    status: order.status,
    amount: formatUnits(order.amount, 18),
    timestamp: Date.now() - (userOrders.length - index) * 3600000, // Placeholder ordering
    type: order.type,
    price: '1.0000',
    orderId: order.orderId,
    dbId: undefined,
    chainId: order.chainId,
  }));
  
  // Filter My Orders based on status and type dropdown
  const filteredMyOrders = myOrders.filter(order => {
    // Status filter
    let statusMatch = true;
    if (statusFilter === 'pending') statusMatch = order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED';
    else if (statusFilter === 'success') statusMatch = order.status === 'COMPLETED';
    else if (statusFilter === 'cancel') statusMatch = order.status === 'CANCELLED';
    
    // Type filter
    let typeMatch = true;
    if (typeFilter === 'buy') typeMatch = order.type === 'buy';
    else if (typeFilter === 'sell') typeMatch = order.type === 'sell';
    
    return statusMatch && typeMatch;
  });
  
  // Display orders based on current view
  const displayedOrders = showMyOrders 
    ? filteredMyOrders
    : publicOrders.filter(order => order.type === activeTab);
  
  const totalOrders = showMyOrders ? userOrders.length : publicOrders.length;
  const hasMoreOrders = false; // Blockchain fetches all at once
  const isLoadingMore = p2p.isLoadingBscOrders || p2p.isLoadingDscOrders || isLoadingUserOrders;
  
  // Trade confirmation modal state
  const [selectedOrder, setSelectedOrder] = useState<{
    id: number;
    userAddress: string;
    fullAddress?: string;
    amount: string;
    timestamp: number;
    type: 'buy' | 'sell';
    price: string;
    status?: string;
    orderId?: any;
    dbId?: string;
    chainId?: number;
  } | null>(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  
  const handleTradeClick = (order: typeof selectedOrder) => {
    setSelectedOrder(order);
    setIsTradeModalOpen(true);
  };

  // Handle cancel order - opens cancel confirmation modal
  const handleCancelClick = (order: any) => {
    if (!order) return;
    setSelectedOrder(order);
    setIsCancelModalOpen(true);
  };

  // Called after successful cancel
  const handleCancelSuccess = () => {
    refetchUserOrders();
    p2p.refetchOrders();
  };

  // Handle create order - calls smart contract
  const handleCreateOrder = async (type: 'buy' | 'sell', amount: string) => {
    try {
      if (type === 'buy') {
        await p2p.handleCreateBuyOrder(amount);
      } else {
        await p2p.handleCreateSellOrder(amount);
      }
      // Refetch orders after creation
      refetchUserOrders();
      p2p.refetchOrders();
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  };

  // Load more orders (pagination)
  const loadMoreOrders = useCallback(() => {
    // Refetch orders
    if (showMyOrders) {
      refetchUserOrders();
    } else {
      p2p.refetchOrders();
    }
  }, [showMyOrders, refetchUserOrders, p2p]);

  // Infinite scroll handler
  useEffect(() => {
    const handleWindowScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMoreOrders && !isLoadingMore) {
        loadMoreOrders();
      }
    };

    window.addEventListener('scroll', handleWindowScroll);
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [loadMoreOrders, hasMoreOrders, isLoadingMore]);

  // Get stats for display
  const platformStats = stats as Stats | null;

  return (
    <div className="min-h-screen bg-background">
      {/* Create Order Modal */}
      <CreateOrderModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetchUserOrders();
          p2p.refetchOrders();
        }}
      />
      
      {/* Trade Confirmation Modal */}
      <TradeConfirmModal
        isOpen={isTradeModalOpen}
        onClose={() => {
          setIsTradeModalOpen(false);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        tradeType={activeTab === 'buy' ? 'sell' : 'buy'}
        onTradeSuccess={() => {
          refetchUserOrders();
          p2p.refetchOrders();
        }}
      />

      {/* Cancel Order Confirmation Modal */}
      <CancelOrderModal
        isOpen={isCancelModalOpen}
        onClose={() => {
          setIsCancelModalOpen(false);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        onCancelSuccess={handleCancelSuccess}
      />

      {/* Hero Section */}
      <div className="bg-gradient-to-b from-surface to-background py-8">
        <div className="max-w-[92rem] mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            <span className="text-primary">DSC</span> P2P
          </h1>
          <p className="text-muted text-sm">
            Trade DEP20 tokens peer-to-peer with zero fees
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[92rem] mx-auto px-4 py-6">
        {/* Top Row: Create Button + My Orders + Filters + Tabs */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Create Button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-3 rounded-xl font-bold transition-all duration-200 bg-primary text-background hover:bg-primary-light"
          >
            + Create
          </button>

          {/* My Orders */}
          <button
            onClick={() => {
              setShowMyOrders(!showMyOrders);
              if (showMyOrders) {
                setTypeFilter('all');
                setStatusFilter('all');
              }
            }}
            className={`px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
              showMyOrders
                ? 'bg-secondary text-white'
                : 'bg-surface text-muted hover:bg-surface-light border border-white/10'
            }`}
          >
            📋 My Orders
          </button>

          {/* Amount Range Filter */}
          <div className="flex items-center gap-2 bg-surface rounded-xl px-3 py-2 border border-white/10">
              <span className="text-muted text-sm">Amount:</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Min"
                value={minAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setMinAmount(val);
                }}
                className="w-20 bg-surface-light border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
              />
              <span className="text-muted">-</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Max"
                value={maxAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setMaxAmount(val);
                }}
                className="w-20 bg-surface-light border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
              />
            </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Buy/Sell Tabs */}
          <div className="flex gap-2">
              <button
                onClick={() => {
                  setActiveTab('buy');
                  setShowMyOrders(false);
                }}
                className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 ${
                  !showMyOrders && activeTab === 'buy'
                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                    : 'bg-surface-light text-muted hover:bg-surface-lighter'
                }`}
              >
                🟢 BUY
              </button>
              <button
                onClick={() => {
                  setActiveTab('sell');
                  setShowMyOrders(false);
                }}
                className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 ${
                  !showMyOrders && activeTab === 'sell'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'bg-surface-light text-muted hover:bg-surface-lighter'
                }`}
              >
                🔴 SELL
              </button>
            </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-surface rounded-xl p-3 border border-white/5 text-center">
            <div className="text-xl font-bold text-red-400">
              {isLoadingMore ? '...' : publicOrders.filter(o => o.type === 'sell').length}
            </div>
            <div className="text-xs text-muted">DSC Sell Orders</div>
          </div>
          <div className="bg-surface rounded-xl p-3 border border-white/5 text-center">
            <div className="text-xl font-bold text-green-400">
              {isLoadingMore ? '...' : publicOrders.filter(o => o.type === 'buy').length}
            </div>
            <div className="text-xs text-muted">BSC Buy Orders</div>
          </div>
          <div className="bg-surface rounded-xl p-3 border border-white/5 text-center">
            <div className="text-xl font-bold text-primary">
              {loadingStats ? '...' : `$${((platformStats?.totalVolume ? parseFloat(platformStats.totalVolume) : 0) / 1000).toFixed(1)}K`}
            </div>
            <div className="text-xs text-muted">Total Volume</div>
          </div>
        </div>

        {/* Order List Header */}
        <div className="bg-surface rounded-t-xl border border-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-white">
                {showMyOrders 
                  ? '📋 My Orders' 
                  : (activeTab === 'buy' ? '📈 BEP20 USDT Orders (BSC Chain)' : '📉 DEP20 USDT Orders (DSC Chain)')
                }
              </h2>
              {/* BUY/SELL Filter - Only show when My Orders is active */}
              {showMyOrders && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setTypeFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      typeFilter === 'all' 
                        ? 'bg-primary text-white' 
                        : 'bg-surface-light text-muted hover:text-white'
                    }`}
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => setTypeFilter('buy')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      typeFilter === 'buy' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-surface-light text-muted hover:text-white'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => setTypeFilter('sell')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      typeFilter === 'sell' 
                        ? 'bg-red-500 text-white' 
                        : 'bg-surface-light text-muted hover:text-white'
                    }`}
                  >
                    SELL
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted">
                {`Showing ${displayedOrders.length} of ${totalOrders} orders`}
              </span>
              {/* Status Filter - Only show when My Orders is active */}
              {showMyOrders && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'success' | 'cancel')}
                  className="bg-surface-light border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="success">Success</option>
                  <option value="cancel">Cancelled</option>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Table Header */}
            <div className="bg-surface-light border-x border-white/5 px-4 py-3 grid grid-cols-12 gap-4 text-xs text-muted uppercase tracking-wider">
              <div className="col-span-4">{showMyOrders ? 'User / Type' : 'User'}</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-center">Time</div>
              <div className="col-span-2 text-center">{showMyOrders ? 'Status' : 'Action'}</div>
            </div>

            {/* Order List with Infinite Scroll */}
            <div className="bg-surface border border-white/5 rounded-b-xl overflow-hidden">
              <div 
                ref={listRef}
                className="divide-y divide-white/5"
              >
                {displayedOrders.map((order, index) => (
                  <OrderRow 
                    key={order.id} 
                    order={order} 
                    index={index} 
                    activeTab={activeTab}
                    isConnected={isConnected}
                    isMyOrders={showMyOrders}
                    onTradeClick={handleTradeClick}
                    onCancelClick={handleCancelClick}
                  />
                ))}
                
                {/* Loading indicator */}
                {isLoadingMore && (
                  <div className="px-4 py-6 text-center">
                    <div className="inline-flex items-center gap-2 text-muted">
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading more orders...
                    </div>
                  </div>
                )}
                
                {/* Empty state */}
                {!isLoadingMore && displayedOrders.length === 0 && (
                  <div className="px-4 py-8 text-center text-muted">
                    {showMyOrders ? 'No orders found' : `No ${activeTab} orders available`}
                  </div>
                )}
                
                {/* End of list indicator */}
                {!hasMoreOrders && displayedOrders.length > 0 && (
                  <div className="px-4 py-4 text-center text-muted text-sm">
                    ✓ All {totalOrders} orders loaded
                  </div>
                )}
              </div>
            </div>

      </div>
    </div>
  );
}
