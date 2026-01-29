// =============================================================================
// Database Hooks - Fetch data from PostgreSQL via API
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

// =============================================================================
// Types
// =============================================================================

export interface Order {
  id: string;
  orderId: string;
  chainId: number;
  maker: string;
  sellToken: string;
  sellAmount: string;
  buyToken: string;
  buyAmount: string;
  srcChainId: number;
  dstChainId: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryItem {
  id: string;
  type: 'buy' | 'sell';
  orderId: string;
  amount: string;
  status: string;
  chainId: number;
  counterparty: string | null;
  txHash: string;
  completedAt: string;
  createdAt: string;
}

export interface Stats {
  totalOrders: number;
  openOrders: number;
  completedOrders: number;
  totalUsers: number;
  totalVolume: string;
}

export interface UserStats {
  openOrders: number;
  completedOrders: number;
  pendingEscrows: number;
  user: {
    address: string;
    ordersCreated: number;
    ordersCompleted: number;
    totalVolume: string;
  };
}

// =============================================================================
// useOrders - Fetch orders from database
// =============================================================================

export function useDbOrders(params?: {
  type?: 'buy' | 'sell';
  status?: string;
  maker?: string;
  chainId?: number;
  minAmount?: string;
  maxAmount?: string;
  limit?: number;
  offset?: number;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const searchParams = new URLSearchParams();
      if (params?.type) searchParams.set('type', params.type);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.maker) searchParams.set('maker', params.maker);
      if (params?.chainId) searchParams.set('chainId', params.chainId.toString());
      if (params?.minAmount) searchParams.set('minAmount', params.minAmount);
      if (params?.maxAmount) searchParams.set('maxAmount', params.maxAmount);
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.offset) searchParams.set('offset', params.offset.toString());

      const response = await fetch(`/api/p2p/orders?${searchParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await response.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [params?.type, params?.status, params?.maker, params?.chainId, params?.minAmount, params?.maxAmount, params?.limit, params?.offset]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, total, loading, error, refetch: fetchOrders };
}

// =============================================================================
// useHistory - Fetch user's executed order history
// =============================================================================

export function useDbHistory(address?: string) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!address) {
      setHistory([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/p2p/history?address=${address}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }

      const data = await response.json();
      setHistory(data.history || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}

// =============================================================================
// useStats - Fetch platform or user statistics
// =============================================================================

export function useDbStats(address?: string) {
  const [stats, setStats] = useState<Stats | UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const url = address ? `/api/p2p/stats?address=${address}` : '/api/p2p/stats';
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

// =============================================================================
// useUser - Get/Create user on wallet connect
// =============================================================================

export function useDbUser() {
  const { address, isConnected } = useAccount();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginUser = useCallback(async () => {
    if (!address || !isConnected) {
      setUser(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Create or update user on login
      const response = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      if (!response.ok) {
        throw new Error('Failed to login user');
      }

      const data = await response.json();
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    loginUser();
  }, [loginUser]);

  return { user, loading, error, refetch: loginUser };
}

// =============================================================================
// useCreateOrder - Create new order
// =============================================================================

export function useCreateOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = async (orderData: Partial<Order>) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/p2p/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const data = await response.json();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createOrder, loading, error };
}

