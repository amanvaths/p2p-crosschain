'use client';

// =============================================================================
// P2P Exchange - Home Page with Buy/Sell Tabs
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

// =============================================================================
// Create Order Modal Component
// =============================================================================

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FIXED_PRICE = '1.00'; // Fixed price $1

function CreateOrderModal({ isOpen, onClose }: CreateOrderModalProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Watch for wallet connection when pending submit
  useEffect(() => {
    if (pendingSubmit && isConnected) {
      handleSubmitOrder();
      setPendingSubmit(false);
    }
  }, [isConnected, pendingSubmit]);

  const handleSubmitOrder = async () => {
    if (!amount) {
      alert('Please enter amount');
      return;
    }

    setIsSubmitting(true);
    try {
      // TODO: Trigger actual smart contract transaction here
      console.log('Creating order:', { orderType, amount, price: FIXED_PRICE });
      
      const payToken = orderType === 'buy' ? 'BEP20 USDT' : 'DEP20';
      const payChain = orderType === 'buy' ? 'BSC' : 'DSC';
      const receiveToken = orderType === 'buy' ? 'DEP20 USDT' : 'BEP20 USDT';
      const receiveChain = orderType === 'buy' ? 'DSC' : 'BSC';
      
      alert(`✅ Order Created!\n\nType: ${orderType.toUpperCase()} DEP20\n\nYou Pay: ${amount} ${payToken} (${payChain} Chain)\nYou Receive: ${amount} ${receiveToken} (${receiveChain} Chain)`);
      
      // Reset form and close modal
      setAmount('');
      setOrderType('buy');
      onClose();
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = () => {
    if (!isConnected) {
      // Mark as pending and open wallet connect
      setPendingSubmit(true);
      openConnectModal?.();
      return;
    }
    
    handleSubmitOrder();
  };

  if (!isOpen) return null;

  // Calculate values
  const numAmount = parseFloat(amount || '0');
  const totalValue = (numAmount * parseFloat(FIXED_PRICE)).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Create Order</h2>
          <button 
            onClick={onClose}
            className="text-muted hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Order Type Selection */}
        <div className="mb-5">
          <label className="block text-sm text-muted mb-3">I want to</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOrderType('buy')}
              className={`py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
                orderType === 'buy'
                  ? 'bg-green-500 text-white shadow-lg shadow-green-500/30 scale-[1.02]'
                  : 'bg-surface-light text-muted hover:bg-surface-lighter border border-white/5'
              }`}
            >
              🟢 BUY DEP20
            </button>
            <button
              type="button"
              onClick={() => setOrderType('sell')}
              className={`py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
                orderType === 'sell'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-[1.02]'
                  : 'bg-surface-light text-muted hover:bg-surface-lighter border border-white/5'
              }`}
            >
              🔴 SELL DEP20
            </button>
          </div>
        </div>

        {/* Transaction Flow Explanation */}
        <div className={`mb-5 p-4 rounded-xl border ${orderType === 'buy' ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Transaction Flow</div>
          
          {orderType === 'buy' ? (
            <div className="space-y-3">
              {/* Pay Section */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <span className="text-yellow-400 font-bold text-sm">BSC</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted">You Pay</div>
                  <div className="text-white font-semibold">BEP20 USDT <span className="text-yellow-400">(BSC Chain)</span></div>
                </div>
                <div className="text-red-400 font-bold">→</div>
              </div>
              
              {/* Receive Section */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <span className="text-purple-400 font-bold text-sm">DSC</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted">You Receive</div>
                  <div className="text-white font-semibold">DEP20 USDT <span className="text-purple-400">(DSC Chain)</span></div>
                </div>
                <div className="text-green-400 font-bold">✓</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Pay Section */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <span className="text-purple-400 font-bold text-sm">DSC</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted">You Pay</div>
                  <div className="text-white font-semibold">DEP20 <span className="text-purple-400">(DSC Chain)</span></div>
                </div>
                <div className="text-red-400 font-bold">→</div>
              </div>
              
              {/* Receive Section */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <span className="text-yellow-400 font-bold text-sm">BSC</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted">You Receive</div>
                  <div className="text-white font-semibold">BEP20 USDT <span className="text-yellow-400">(BSC Chain)</span></div>
                </div>
                <div className="text-green-400 font-bold">✓</div>
              </div>
            </div>
          )}
        </div>

        {/* Price Display */}
        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-sm text-muted">Exchange Rate</span>
          <span className="text-white font-medium">1 DEP20 = ${FIXED_PRICE} USDT</span>
        </div>

        {/* Amount Input */}
        <div className="mb-5">
          <label className="block text-sm text-muted mb-2">
            {orderType === 'buy' ? 'DEP20 Amount to Buy' : 'DEP20 Amount to Sell'}
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                setAmount(val);
              }}
              placeholder="0.00"
              className="w-full bg-surface-light border border-white/10 rounded-xl px-4 py-3 pr-24 text-white text-lg focus:outline-none focus:border-primary transition-colors"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-medium">
              DEP20
            </span>
          </div>
        </div>

        {/* Order Summary */}
        {numAmount > 0 && (
          <div className="mb-5 p-4 bg-surface-light rounded-xl border border-white/5">
            <div className="text-xs text-muted uppercase tracking-wider mb-3">Order Summary</div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted text-sm">
                  {orderType === 'buy' ? 'You Pay (BSC)' : 'You Pay (DSC)'}
                </span>
                <span className="text-white font-medium">
                  {numAmount.toLocaleString()} {orderType === 'buy' ? 'BEP20 USDT' : 'DEP20'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted text-sm">
                  {orderType === 'buy' ? 'You Receive (DSC)' : 'You Receive (BSC)'}
                </span>
                <span className="text-white font-medium">
                  {numAmount.toLocaleString()} {orderType === 'buy' ? 'DEP20 USDT' : 'BEP20 USDT'}
                </span>
              </div>
              
              <div className="border-t border-white/10 pt-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-white">Total Value</span>
                  <span className="text-xl font-bold text-primary">${totalValue}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={isSubmitting || !amount}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            orderType === 'buy'
              ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30'
              : 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30'
          }`}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : !isConnected ? (
            `Connect Wallet & ${orderType === 'buy' ? 'Buy' : 'Sell'}`
          ) : (
            `Confirm ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`
          )}
        </button>

        {/* Help Text */}
        <p className="text-xs text-muted text-center mt-4">
          {!isConnected 
            ? 'You need to connect your wallet to create an order'
            : 'Your tokens will be locked in escrow until the order is filled'
          }
        </p>
      </div>
    </div>
  );
}

// Generate dummy data - 500 orders total for infinite scroll demo
const generateDummyOrders = () => {
  const orders = [];
  const now = Date.now();
  
  for (let i = 1; i <= 500; i++) {
    const isSellOrder = i % 2 === 0; // Alternating buy/sell
    const randomAmount = (Math.random() * 10000 + 100).toFixed(2);
    const randomMinutes = Math.floor(Math.random() * 60 * 24 * 7); // Random time within 7 days
    const timestamp = now - randomMinutes * 60 * 1000;
    
    orders.push({
      id: i,
      userAddress: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
      amount: randomAmount,
      timestamp,
      type: isSellOrder ? 'sell' : 'buy', // 'sell' orders appear in BUY tab, 'buy' orders in SELL tab
      price: '1.0000', // Fixed price $1
    });
  }
  
  return orders.sort((a, b) => b.timestamp - a.timestamp);
};

const allDummyOrders = generateDummyOrders();
const ORDERS_PER_PAGE = 50;

// Generate dummy executed history
const generateExecutedHistory = () => {
  const history = [];
  const now = Date.now();
  
  for (let i = 1; i <= 100; i++) {
    const isBuy = i % 2 === 0;
    const randomAmount = (Math.random() * 5000 + 50).toFixed(2);
    const randomDays = Math.floor(Math.random() * 30); // Random time within 30 days
    const timestamp = now - randomDays * 24 * 60 * 60 * 1000;
    
    history.push({
      id: i,
      type: isBuy ? 'buy' : 'sell',
      amount: randomAmount,
      price: '1.0000',
      total: randomAmount, // Since price is $1
      timestamp,
      txHash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 10)}`,
      status: 'completed',
      counterparty: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
    });
  }
  
  return history.sort((a, b) => b.timestamp - a.timestamp);
};

const executedHistory = generateExecutedHistory();

// Mark some orders as "user's orders" for demo
const userOrderIds = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29];

// =============================================================================
// Trade Confirmation Modal - Compact design with proper scrolling
// =============================================================================

interface TradeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: number;
    userAddress: string;
    amount: string;
    timestamp: number;
    type: 'buy' | 'sell';
    price: string;
  } | null;
  tradeType: 'buy' | 'sell';
}

function TradeConfirmModal({ isOpen, onClose, order, tradeType }: TradeConfirmModalProps) {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'confirm' | 'processing' | 'success' | 'error'>('confirm');

  if (!isOpen || !order) return null;

  const amount = parseFloat(order.amount);
  const isBuying = tradeType === 'buy';
  
  // When buying DEP20: User pays BEP20 USDT on BSC, receives DEP20 USDT on DSC
  // When selling DEP20: User pays DEP20 on DSC, receives BEP20 USDT on BSC
  const payToken = isBuying ? 'BEP20 USDT' : 'DEP20';
  const payChain = isBuying ? 'BSC' : 'DSC';
  const receiveToken = isBuying ? 'DEP20 USDT' : 'BEP20 USDT';
  const receiveChain = isBuying ? 'DSC' : 'BSC';

  const handleConfirmTrade = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    setIsProcessing(true);
    setStep('processing');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Executing trade:', { order, tradeType, address });
      setStep('success');
    } catch (error) {
      console.error('Trade error:', error);
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStep('confirm');
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={step === 'confirm' ? handleClose : undefined}
      />
      
      {/* Modal - Compact with max-height */}
      <div className="relative bg-surface border border-white/10 rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        
        {step === 'confirm' && (
          <>
            {/* Header - Compact */}
            <div className={`p-4 border-b border-white/10 flex items-center justify-between ${isBuying ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{isBuying ? '🟢' : '🔴'}</span>
                <h2 className="text-lg font-bold text-white">
                  {isBuying ? 'Buy' : 'Sell'} DEP20
                </h2>
              </div>
              <button onClick={handleClose} className="text-muted hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {/* Trading With */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Trading with:</span>
                <span className="font-mono text-white/80">{order.userAddress}</span>
              </div>

              {/* You Pay */}
              <div className={`p-3 rounded-lg border ${isBuying ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-purple-500/30 bg-purple-500/5'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted uppercase">You Pay</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${isBuying ? 'bg-yellow-500/20 text-yellow-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {payChain}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isBuying ? 'bg-yellow-500/20 text-yellow-400' : 'bg-purple-500/20 text-purple-400'}`}>
                      {payChain}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">{amount.toLocaleString()}</div>
                      <div className="text-xs text-muted">{payToken}</div>
                    </div>
                  </div>
                  <div className="text-red-400">↑</div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>

              {/* You Receive */}
              <div className={`p-3 rounded-lg border ${isBuying ? 'border-purple-500/30 bg-purple-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted uppercase">You Receive</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${isBuying ? 'bg-purple-500/20 text-purple-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {receiveChain}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isBuying ? 'bg-purple-500/20 text-purple-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {receiveChain}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">{amount.toLocaleString()}</div>
                      <div className="text-xs text-muted">{receiveToken}</div>
                    </div>
                  </div>
                  <div className="text-green-400">↓</div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-surface-light rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Rate</span>
                  <span className="text-white">1 DEP20 = $1.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Fee</span>
                  <span className="text-green-400">FREE</span>
                </div>
                <div className="border-t border-white/10 pt-2 flex justify-between">
                  <span className="text-white font-medium">Total</span>
                  <span className="text-lg font-bold text-primary">${amount.toLocaleString()}</span>
                </div>
              </div>

              {/* Warning - Compact */}
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded-lg text-xs text-yellow-200/80">
                <span>⚠️</span>
                <span>Ensure sufficient {payToken} on {payChain} Chain</span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-surface-light flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-lg font-medium text-muted bg-surface hover:bg-surface-lighter border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTrade}
                disabled={isProcessing}
                className={`flex-1 py-3 rounded-lg font-bold text-white disabled:opacity-50 ${
                  isBuying ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500 hover:bg-red-400'
                }`}
              >
                {!isConnected ? 'Connect Wallet' : `Confirm ${isBuying ? 'Buy' : 'Sell'}`}
              </button>
            </div>
          </>
        )}

        {step === 'processing' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
              <svg className="animate-spin w-8 h-8 text-primary" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Processing</h3>
            <p className="text-sm text-muted">Confirm in your wallet...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Success!</h3>
            <p className="text-sm text-muted mb-4">{amount.toLocaleString()} DEP20 {isBuying ? 'bought' : 'sold'}</p>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-lg font-bold text-white bg-primary hover:bg-primary-light"
            >
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-3xl">❌</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Failed</h3>
            <p className="text-sm text-muted mb-4">Transaction failed. Try again.</p>
            <div className="flex gap-2">
              <button onClick={handleClose} className="flex-1 py-3 rounded-lg font-medium text-muted bg-surface border border-white/10">
                Close
              </button>
              <button onClick={() => setStep('confirm')} className="flex-1 py-3 rounded-lg font-bold text-white bg-primary">
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
  };
  index: number;
  activeTab: 'buy' | 'sell';
  isConnected: boolean;
  onTradeClick: (order: OrderRowProps['order']) => void;
}

function OrderRow({ order, index, activeTab, isConnected, onTradeClick }: OrderRowProps) {
  return (
    <div
      className="px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-white/[0.02] transition-colors"
      style={{ animationDelay: `${index * 20}ms` }}
    >
      {/* User Address */}
      <div className="col-span-4 flex items-center gap-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          order.type === 'sell' 
            ? 'bg-green-500/20 text-green-400' 
            : 'bg-red-500/20 text-red-400'
        }`}>
          {order.type === 'sell' ? 'S' : 'B'}
        </div>
        <span className="font-mono text-sm text-white/80">
          {order.userAddress}
        </span>
      </div>

      {/* Amount */}
      <div className="col-span-2 text-right">
        <span className="font-semibold text-white">
          {Number(order.amount).toLocaleString()}
        </span>
        <span className="text-muted text-xs ml-1">DEP20</span>
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

      {/* Action Button */}
      <div className="col-span-2 text-center">
        <button
          onClick={() => onTradeClick(order)}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
            activeTab === 'buy'
              ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20'
              : 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20'
          }`}
        >
          {activeTab === 'buy' ? 'BUY' : 'SELL'}
        </button>
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
  const [displayCount, setDisplayCount] = useState(ORDERS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  
  // Trade confirmation modal state
  const [selectedOrder, setSelectedOrder] = useState<{
    id: number;
    userAddress: string;
    amount: string;
    timestamp: number;
    type: 'buy' | 'sell';
    price: string;
  } | null>(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  
  const handleTradeClick = (order: typeof selectedOrder) => {
    setSelectedOrder(order);
    setIsTradeModalOpen(true);
  };

  // Simulated user address for demo (first few orders belong to "user")
  const userAddress = address || '0x1234abcd...5678';

  // Filter orders based on active tab, amount range, and my orders filter
  // BUY tab shows orders from sellers (type: 'sell')
  // SELL tab shows orders from buyers (type: 'buy')
  const allFilteredOrders = allDummyOrders.filter(order => {
    // My Orders filter
    if (showMyOrders && !userOrderIds.includes(order.id)) return false;
    
    // Tab filter
    const tabMatch = activeTab === 'buy' ? order.type === 'sell' : order.type === 'buy';
    if (!tabMatch) return false;
    
    // Amount range filter
    const amount = parseFloat(order.amount);
    if (minAmount && amount < parseFloat(minAmount)) return false;
    if (maxAmount && amount > parseFloat(maxAmount)) return false;
    
    return true;
  });
  
  // Get only the orders to display (paginated)
  const displayedOrders = allFilteredOrders.slice(0, displayCount);
  const hasMoreOrders = displayCount < allFilteredOrders.length;

  // Reset display count when tab or filters change
  useEffect(() => {
    setDisplayCount(ORDERS_PER_PAGE);
  }, [activeTab, minAmount, maxAmount]);

  // Load more orders function
  const loadMoreOrders = useCallback(() => {
    if (isLoadingMore || !hasMoreOrders) return;
    
    setIsLoadingMore(true);
    // Simulate network delay for realistic feel
    setTimeout(() => {
      setDisplayCount(prev => Math.min(prev + ORDERS_PER_PAGE, allFilteredOrders.length));
      setIsLoadingMore(false);
    }, 300);
  }, [isLoadingMore, hasMoreOrders, allFilteredOrders.length]);

  // Infinite scroll handler - uses window scroll
  useEffect(() => {
    const handleWindowScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      
      // Load more when user is 200px from bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMoreOrders();
      }
    };

    window.addEventListener('scroll', handleWindowScroll);
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [loadMoreOrders]);

  return (
    <div className="min-h-screen bg-background">
      {/* Create Order Modal */}
      <CreateOrderModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />
      
      {/* Trade Confirmation Modal */}
      <TradeConfirmModal
        isOpen={isTradeModalOpen}
        onClose={() => {
          setIsTradeModalOpen(false);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        tradeType={activeTab}
      />

      {/* Hero Section */}
      <div className="bg-gradient-to-b from-surface to-background py-8">
        <div className="max-w-[92rem] mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            <span className="text-primary">DEP20</span> P2P Exchange
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
              setShowHistory(false);
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
          {!showHistory && (
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
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Buy/Sell Tabs - Only show when not in history view */}
          {!showHistory && (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('buy')}
                className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 ${
                  activeTab === 'buy'
                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                    : 'bg-surface-light text-muted hover:bg-surface-lighter'
                }`}
              >
                🟢 BUY
              </button>
              <button
                onClick={() => setActiveTab('sell')}
                className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 ${
                  activeTab === 'sell'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'bg-surface-light text-muted hover:bg-surface-lighter'
                }`}
              >
                🔴 SELL
              </button>
            </div>
          )}
        </div>

        {/* Stats Section - Hide when showing history */}
        {!showHistory && (
        <>
        {/* Stats Section */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-surface rounded-xl p-3 border border-white/5 text-center">
            <div className="text-xl font-bold text-green-400">
              {allDummyOrders.filter(o => o.type === 'sell').length}
            </div>
            <div className="text-xs text-muted">Active Sellers</div>
          </div>
          <div className="bg-surface rounded-xl p-3 border border-white/5 text-center">
            <div className="text-xl font-bold text-red-400">
              {allDummyOrders.filter(o => o.type === 'buy').length}
            </div>
            <div className="text-xs text-muted">Active Buyers</div>
          </div>
          <div className="bg-surface rounded-xl p-3 border border-white/5 text-center">
            <div className="text-xl font-bold text-primary">
              ${(allDummyOrders.reduce((acc, o) => acc + parseFloat(o.amount), 0) / 1000).toFixed(1)}K
            </div>
            <div className="text-xs text-muted">Total Volume</div>
          </div>
        </div>

        {/* Order List Header */}
        <div className="bg-surface rounded-t-xl border border-white/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">
              {showHistory 
                ? '📜 Executed History' 
                : (activeTab === 'buy' ? '📈 Available Sellers' : '📉 Available Buyers')
              }
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted">
                {showHistory 
                  ? `${executedHistory.length} transactions`
                  : `Showing ${displayedOrders.length} of ${allFilteredOrders.length} orders`
                }
              </span>
              <button
                onClick={() => {
                  setShowHistory(!showHistory);
                  setShowMyOrders(false);
                }}
                className={`text-sm font-medium transition-all duration-200 ${
                  showHistory
                    ? 'text-white bg-accent px-3 py-1 rounded-lg'
                    : 'text-accent hover:text-accent-light underline underline-offset-2'
                }`}
              >
                {showHistory ? '← Back to Orders' : '📜 Executed History'}
              </button>
            </div>
          </div>
        </div>

        {showHistory ? (
          /* Executed History List */
          <div className="bg-surface border border-white/5 rounded-b-xl divide-y divide-white/5">
            {executedHistory.map((item) => (
              <div
                key={item.id}
                className="p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                      item.type === 'buy' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {item.type === 'buy' ? '🟢 BOUGHT' : '🔴 SOLD'}
                    </div>
                    <span className="text-white font-semibold">
                      {Number(item.amount).toLocaleString()} DEP20
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">${Number(item.total).toLocaleString()}</div>
                    <div className="text-xs text-muted">@ ${item.price}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4 text-muted">
                    <span>📅 {new Date(item.timestamp).toLocaleDateString()}</span>
                    <span>🕐 {new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted">
                      with <span className="font-mono text-white/60">{item.counterparty}</span>
                    </span>
                    <a 
                      href="#" 
                      className="text-primary hover:text-primary-light font-mono"
                      onClick={(e) => e.preventDefault()}
                    >
                      {item.txHash}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="bg-surface-light border-x border-white/5 px-4 py-3 grid grid-cols-12 gap-4 text-xs text-muted uppercase tracking-wider">
              <div className="col-span-4">User</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-center">Time</div>
              <div className="col-span-2 text-center">Action</div>
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
                    onTradeClick={handleTradeClick}
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
                
                {/* End of list indicator */}
                {!hasMoreOrders && displayedOrders.length > 0 && (
                  <div className="px-4 py-4 text-center text-muted text-sm">
                    ✓ All {allFilteredOrders.length} orders loaded
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        </>
        )}

      </div>
    </div>
  );
}
