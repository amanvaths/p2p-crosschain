'use client';

// =============================================================================
// P2P Exchange - Create Order Page
// =============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { Address, Hash, Hex } from 'viem';
import { sepolia, baseSepolia } from 'viem/chains';

import { TokenInput } from '@/components/TokenInput';
import { ChainSelector } from '@/components/ChainSelector';
import { SecretDisplay } from '@/components/SecretDisplay';
import { SwapProgress } from '@/components/Timeline';
import { useCreateOrder } from '@/hooks/useP2POrderbook';
import { useLockTokens } from '@/hooks/useP2PEscrow';
import { useTokenApproval, useTokenBalance } from '@/hooks/useTokenApproval';
import { generateSecret, computeHashLock, parseAmount } from '@/lib/utils';
import { getContractAddress, getToken, DEFAULT_MAKER_TIMELOCK, DEFAULT_TAKER_TIMELOCK } from '@/lib/config';

type Step = 'configure' | 'approve' | 'create' | 'lock' | 'complete';

export default function CreateOrderPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Form state
  const [srcChainId, setSrcChainId] = useState<number>(sepolia.id);
  const [dstChainId, setDstChainId] = useState<number>(baseSepolia.id);
  const [sellToken, setSellToken] = useState<Address>();
  const [sellAmount, setSellAmount] = useState('');
  const [buyToken, setBuyToken] = useState<Address>();
  const [buyAmount, setBuyAmount] = useState('');

  // Secret state (generated locally)
  const [secret, setSecret] = useState<Hex>();
  const [hashLock, setHashLock] = useState<Hash>();

  // Step tracking
  const [currentStep, setCurrentStep] = useState<Step>('configure');

  // Hooks
  const { balance: sellBalance } = useTokenBalance(sellToken);
  const sellTokenInfo = getToken(srcChainId, sellToken ?? '');
  const {
    allowance,
    approve,
    needsApproval,
    isPending: isApproving,
    isConfirming: isApprovalConfirming,
    isSuccess: isApprovalSuccess,
  } = useTokenApproval(sellToken);

  const {
    createOrder,
    isPending: isCreating,
    isConfirming: isCreateConfirming,
    isSuccess: isCreateSuccess,
    hash: createHash,
  } = useCreateOrder();

  const {
    lock,
    isPending: isLocking,
    isConfirming: isLockConfirming,
    isSuccess: isLockSuccess,
    hash: lockHash,
  } = useLockTokens();

  // Generate secret on mount
  useEffect(() => {
    const s = generateSecret();
    const h = computeHashLock(s);
    setSecret(s);
    setHashLock(h);
  }, []);

  // Handle approval success
  useEffect(() => {
    if (isApprovalSuccess && currentStep === 'approve') {
      setCurrentStep('create');
    }
  }, [isApprovalSuccess, currentStep]);

  // Handle create success
  useEffect(() => {
    if (isCreateSuccess && currentStep === 'create') {
      setCurrentStep('lock');
    }
  }, [isCreateSuccess, currentStep]);

  // Handle lock success
  useEffect(() => {
    if (isLockSuccess && currentStep === 'lock') {
      setCurrentStep('complete');
    }
  }, [isLockSuccess, currentStep]);

  // Validation
  const isValid = useCallback(() => {
    if (!sellToken || !buyToken || !sellAmount || !buyAmount) return false;
    if (!srcChainId || !dstChainId || srcChainId === dstChainId) return false;
    if (!hashLock) return false;

    const decimals = sellTokenInfo?.decimals ?? 18;
    const parsedAmount = parseAmount(sellAmount, decimals);
    if (parsedAmount <= 0n) return false;
    if (sellBalance && parsedAmount > sellBalance) return false;

    return true;
  }, [sellToken, buyToken, sellAmount, buyAmount, srcChainId, dstChainId, hashLock, sellTokenInfo, sellBalance]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!isValid() || !sellToken || !buyToken || !hashLock || !address) return;

    const sellDecimals = sellTokenInfo?.decimals ?? 18;
    const buyTokenInfo = getToken(dstChainId, buyToken);
    const buyDecimals = buyTokenInfo?.decimals ?? 18;

    const parsedSellAmount = parseAmount(sellAmount, sellDecimals);
    const parsedBuyAmount = parseAmount(buyAmount, buyDecimals);

    // Check if we're on the right chain
    if (chainId !== srcChainId) {
      switchChain({ chainId: srcChainId });
      return;
    }

    // Check if approval is needed
    if (needsApproval(parsedSellAmount)) {
      setCurrentStep('approve');
      await approve();
      return;
    }

    // Create order
    setCurrentStep('create');
    await createOrder({
      sellToken,
      sellAmount: parsedSellAmount,
      buyToken,
      buyAmount: parsedBuyAmount,
      dstChainId,
      hashLock,
      makerTimelock: DEFAULT_MAKER_TIMELOCK,
      takerTimelock: DEFAULT_TAKER_TIMELOCK,
    });
  };

  // Determine button state
  const getButtonState = () => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true };
    if (chainId !== srcChainId) return { text: `Switch to ${srcChainId === sepolia.id ? 'Sepolia' : 'Base Sepolia'}`, disabled: false, action: () => switchChain({ chainId: srcChainId }) };
    if (!isValid()) return { text: 'Enter valid amounts', disabled: true };
    if (isApproving || isApprovalConfirming) return { text: 'Approving...', disabled: true };
    if (isCreating || isCreateConfirming) return { text: 'Creating Order...', disabled: true };
    if (isLocking || isLockConfirming) return { text: 'Locking Tokens...', disabled: true };
    if (currentStep === 'complete') return { text: 'Order Created!', disabled: true };

    const sellDecimals = sellTokenInfo?.decimals ?? 18;
    const parsedSellAmount = parseAmount(sellAmount || '0', sellDecimals);
    if (sellToken && needsApproval(parsedSellAmount)) {
      return { text: 'Approve & Create Order', disabled: false };
    }

    return { text: 'Create Order', disabled: false };
  };

  const buttonState = getButtonState();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Create Order</h1>
          <p className="text-muted">
            Set up your swap terms. You'll need to lock tokens after creating the order.
          </p>
        </div>

        {/* Progress */}
        {currentStep !== 'configure' && (
          <div className="card mb-8">
            <SwapProgress
              currentStep={
                currentStep === 'approve'
                  ? 0
                  : currentStep === 'create'
                  ? 1
                  : currentStep === 'lock'
                  ? 2
                  : 3
              }
              role="maker"
            />
          </div>
        )}

        {/* Form */}
        <div className="card space-y-6">
          {/* Source Chain & Sell Token */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">You're Selling</h3>
            <ChainSelector
              label="Source Chain"
              value={srcChainId}
              onChange={setSrcChainId}
              excludeChain={dstChainId}
            />
            <TokenInput
              label="Token & Amount"
              chainId={srcChainId}
              value={sellAmount}
              token={sellToken}
              onChange={setSellAmount}
              onTokenChange={setSellToken}
            />
          </div>

          {/* Swap Direction Indicator */}
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-surface-light border border-white/10">
              <svg
                className="w-6 h-6 text-primary transform rotate-90"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
          </div>

          {/* Destination Chain & Buy Token */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">You Want</h3>
            <ChainSelector
              label="Destination Chain"
              value={dstChainId}
              onChange={setDstChainId}
              excludeChain={srcChainId}
            />
            <TokenInput
              label="Token & Amount"
              chainId={dstChainId}
              value={buyAmount}
              token={buyToken}
              onChange={setBuyAmount}
              onTokenChange={setBuyToken}
              showBalance={false}
            />
          </div>

          {/* Secret Display */}
          {hashLock && (
            <div className="pt-4 border-t border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">
                Your Secret (Save This!)
              </h3>
              <SecretDisplay secret={secret} hashLock={hashLock} />
            </div>
          )}

          {/* Timelock Info */}
          <div className="p-4 bg-surface-light/50 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-primary shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <div className="font-medium text-white">Timelock Settings</div>
                <div className="text-sm text-muted mt-1">
                  Your tokens will be locked for up to <span className="text-primary">24 hours</span>. 
                  The taker must lock within <span className="text-secondary">12 hours</span>. 
                  If the swap doesn't complete, you can refund after the timelock expires.
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          {!isConnected ? (
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button onClick={openConnectModal} className="btn-primary w-full">
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          ) : (
            <button
              onClick={buttonState.action ?? handleSubmit}
              disabled={buttonState.disabled}
              className="btn-primary w-full"
            >
              {buttonState.text}
            </button>
          )}
        </div>

        {/* Transaction Links */}
        {(createHash || lockHash) && (
          <div className="mt-4 p-4 bg-surface rounded-lg">
            <div className="text-sm text-muted">Transaction submitted</div>
            {createHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${createHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-light text-sm"
              >
                View on Explorer →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

