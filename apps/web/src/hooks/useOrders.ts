'use client';

// =============================================================================
// P2P Exchange - Orders API Hook
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrderStatus, OrderWithEscrows, OrderTimelineResponse } from '@p2p/shared';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface OrdersQueryParams {
  status?: OrderStatus;
  maker?: string;
  srcChainId?: number;
  dstChainId?: number;
  page?: number;
  limit?: number;
}

export interface OrdersResponse {
  orders: OrderWithEscrows[];
  total: number;
  page: number;
  limit: number;
}

// -----------------------------------------------------------------------------
// API Functions
// -----------------------------------------------------------------------------

async function fetchOrders(params: OrdersQueryParams = {}): Promise<OrdersResponse> {
  const searchParams = new URLSearchParams();

  if (params.status) searchParams.set('status', params.status);
  if (params.maker) searchParams.set('maker', params.maker);
  if (params.srcChainId) searchParams.set('srcChainId', params.srcChainId.toString());
  if (params.dstChainId) searchParams.set('dstChainId', params.dstChainId.toString());
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const response = await fetch(`/api/orders?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch orders');
  }

  return response.json();
}

async function fetchOrder(id: string): Promise<OrderWithEscrows> {
  const response = await fetch(`/api/orders/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch order');
  }

  return response.json();
}

async function fetchOrderTimeline(id: string): Promise<OrderTimelineResponse> {
  const response = await fetch(`/api/orders/${id}/timeline`);

  if (!response.ok) {
    throw new Error('Failed to fetch order timeline');
  }

  return response.json();
}

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------

/**
 * Hook to fetch orders list
 */
export function useOrders(params: OrdersQueryParams = {}) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => fetchOrders(params),
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch a single order
 */
export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id!),
    enabled: !!id,
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

/**
 * Hook to fetch order timeline
 */
export function useOrderTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ['order-timeline', id],
    queryFn: () => fetchOrderTimeline(id!),
    enabled: !!id,
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

/**
 * Hook to refresh orders data
 */
export function useRefreshOrders() {
  const queryClient = useQueryClient();

  return {
    refreshOrders: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    refreshOrder: (id: string) => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['order-timeline', id] });
    },
  };
}

