'use client';

// =============================================================================
// P2P Exchange - Timeline Component
// =============================================================================

import { CheckIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { SwapStep } from '@p2p/shared';
import { truncateAddress, getExplorerTxUrl } from '@/lib/utils';

interface TimelineProps {
  steps: SwapStep[];
}

export function Timeline({ steps }: TimelineProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => (
        <TimelineStep
          key={step.id}
          step={step}
          isLast={index === steps.length - 1}
        />
      ))}
    </div>
  );
}

interface TimelineStepProps {
  step: SwapStep;
  isLast: boolean;
}

function TimelineStep({ step, isLast }: TimelineStepProps) {
  const dotClassName = `timeline-dot ${step.status}`;

  return (
    <div className="timeline-step">
      {/* Dot */}
      <div className={dotClassName}>
        {step.status === 'completed' && (
          <CheckIcon className="w-4 h-4" />
        )}
        {step.status === 'active' && (
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        )}
        {step.status === 'error' && (
          <XMarkIcon className="w-4 h-4" />
        )}
        {step.status === 'pending' && (
          <div className="w-2 h-2 rounded-full bg-muted" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2">
          <h4
            className={`text-sm font-medium ${
              step.status === 'completed'
                ? 'text-success'
                : step.status === 'active'
                ? 'text-white'
                : step.status === 'error'
                ? 'text-error'
                : 'text-muted'
            }`}
          >
            {step.title}
          </h4>
          {step.status === 'active' && (
            <span className="badge badge-warning">In Progress</span>
          )}
        </div>

        <p className="mt-1 text-sm text-muted">{step.description}</p>

        {step.txHash && step.chainId && (
          <a
            href={getExplorerTxUrl(step.chainId, step.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary-light transition-colors"
          >
            <span className="font-mono">{truncateAddress(step.txHash, 6)}</span>
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Swap Progress Component
// =============================================================================

interface SwapProgressProps {
  currentStep: number;
  role: 'maker' | 'taker';
}

export function SwapProgress({ currentStep, role }: SwapProgressProps) {
  const makerSteps: SwapStep[] = [
    {
      id: '1',
      title: 'Create Order',
      description: 'Submit order intent to the orderbook',
      status: currentStep > 0 ? 'completed' : currentStep === 0 ? 'active' : 'pending',
    },
    {
      id: '2',
      title: 'Lock Tokens',
      description: 'Lock your sell tokens in the escrow contract',
      status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'active' : 'pending',
    },
    {
      id: '3',
      title: 'Wait for Taker',
      description: 'Wait for a taker to lock tokens on the destination chain',
      status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'active' : 'pending',
    },
    {
      id: '4',
      title: 'Claim Tokens',
      description: 'Claim your buy tokens by revealing the secret',
      status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'active' : 'pending',
    },
    {
      id: '5',
      title: 'Complete',
      description: 'Swap completed successfully',
      status: currentStep >= 4 ? 'completed' : 'pending',
    },
  ];

  const takerSteps: SwapStep[] = [
    {
      id: '1',
      title: 'Find Order',
      description: 'Browse available orders to fill',
      status: currentStep > 0 ? 'completed' : currentStep === 0 ? 'active' : 'pending',
    },
    {
      id: '2',
      title: 'Lock Tokens',
      description: 'Lock your buy tokens in the escrow contract',
      status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'active' : 'pending',
    },
    {
      id: '3',
      title: 'Wait for Secret',
      description: 'Wait for maker to reveal the secret by claiming',
      status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'active' : 'pending',
    },
    {
      id: '4',
      title: 'Claim Tokens',
      description: 'Claim your sell tokens using the revealed secret',
      status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'active' : 'pending',
    },
    {
      id: '5',
      title: 'Complete',
      description: 'Swap completed successfully',
      status: currentStep >= 4 ? 'completed' : 'pending',
    },
  ];

  const steps = role === 'maker' ? makerSteps : takerSteps;

  return <Timeline steps={steps} />;
}

export default Timeline;

