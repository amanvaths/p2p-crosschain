'use client';

// =============================================================================
// P2P Exchange - Countdown Timer Component
// =============================================================================

import { useState, useEffect } from 'react';
import { formatCountdown, isExpired } from '@/lib/utils';

interface CountdownProps {
  timestamp: number | bigint;
  onExpire?: () => void;
  className?: string;
  showLabel?: boolean;
  label?: string;
}

export function Countdown({
  timestamp,
  onExpire,
  className = '',
  showLabel = true,
  label = 'Time remaining',
}: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      if (isExpired(timestamp)) {
        setExpired(true);
        setTimeLeft('Expired');
        onExpire?.();
        return;
      }

      setTimeLeft(formatCountdown(timestamp));
    };

    // Initial update
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [timestamp, onExpire]);

  return (
    <div className={className}>
      {showLabel && (
        <div className="text-xs text-muted mb-1">{label}</div>
      )}
      <div
        className={`font-mono text-lg font-semibold ${
          expired ? 'text-error' : 'text-warning'
        }`}
      >
        {timeLeft}
      </div>
    </div>
  );
}

// =============================================================================
// Progress Countdown Component
// =============================================================================

interface ProgressCountdownProps {
  timestamp: number | bigint;
  totalDuration: number; // in seconds
  className?: string;
}

export function ProgressCountdown({
  timestamp,
  totalDuration,
  className = '',
}: ProgressCountdownProps) {
  const [progress, setProgress] = useState(100);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const updateProgress = () => {
      const now = Math.floor(Date.now() / 1000);
      const target = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
      const remaining = target - now;

      if (remaining <= 0) {
        setProgress(0);
        setTimeLeft('Expired');
        return;
      }

      const progressPercent = Math.min(100, (remaining / totalDuration) * 100);
      setProgress(progressPercent);
      setTimeLeft(formatCountdown(timestamp));
    };

    updateProgress();
    const interval = setInterval(updateProgress, 1000);

    return () => clearInterval(interval);
  }, [timestamp, totalDuration]);

  const getProgressColor = () => {
    if (progress > 50) return 'bg-success';
    if (progress > 25) return 'bg-warning';
    return 'bg-error';
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">Time Remaining</span>
        <span className="font-mono text-sm font-medium text-white">{timeLeft}</span>
      </div>
      <div className="h-2 bg-surface-lighter rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${getProgressColor()}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default Countdown;

