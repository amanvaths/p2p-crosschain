// =============================================================================
// P2P Exchange - Orders API Route
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db';
import { checkRateLimit, getCached, setCache } from '@/lib/redis';
import { OrderStatus } from '@prisma/client';

// Query params schema
const querySchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  maker: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  srcChainId: z.coerce.number().int().positive().optional(),
  dstChainId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
    const rateLimit = await checkRateLimit(`orders:${ip}`);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimit.resetIn },
        { status: 429 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      status: searchParams.get('status') ?? undefined,
      maker: searchParams.get('maker') ?? undefined,
      srcChainId: searchParams.get('srcChainId') ?? undefined,
      dstChainId: searchParams.get('dstChainId') ?? undefined,
      page: searchParams.get('page') ?? 1,
      limit: searchParams.get('limit') ?? 20,
    });

    // Build cache key
    const cacheKey = `orders:${JSON.stringify(params)}`;

    // Check cache
    const cached = await getCached<{
      orders: unknown[];
      total: number;
      page: number;
      limit: number;
    }>(cacheKey);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        },
      });
    }

    // Build query filter
    const where: Record<string, unknown> = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.maker) {
      where.maker = params.maker.toLowerCase();
    }

    if (params.srcChainId) {
      where.srcChainId = params.srcChainId;
    }

    if (params.dstChainId) {
      where.dstChainId = params.dstChainId;
    }

    // Fetch orders with pagination
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          escrows: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.order.count({ where }),
    ]);

    // Transform orders for response
    const transformedOrders = orders.map((order) => {
      const makerEscrow = order.escrows.find(
        (e) => e.chainId === order.srcChainId
      );
      const takerEscrow = order.escrows.find(
        (e) => e.chainId === order.dstChainId
      );

      return {
        ...order,
        orderId: order.orderId.toString(),
        sellAmount: order.sellAmount,
        buyAmount: order.buyAmount,
        makerTimelock: order.makerTimelock.toString(),
        takerTimelock: order.takerTimelock.toString(),
        blockNumber: order.blockNumber.toString(),
        makerEscrow: makerEscrow
          ? {
              ...makerEscrow,
              amount: makerEscrow.amount,
              timelock: makerEscrow.timelock.toString(),
              blockNumber: makerEscrow.blockNumber.toString(),
            }
          : undefined,
        takerEscrow: takerEscrow
          ? {
              ...takerEscrow,
              amount: takerEscrow.amount,
              timelock: takerEscrow.timelock.toString(),
              blockNumber: takerEscrow.blockNumber.toString(),
            }
          : undefined,
        escrows: undefined,
      };
    });

    const response = {
      orders: transformedOrders,
      total,
      page: params.page,
      limit: params.limit,
    };

    // Cache for 10 seconds
    await setCache(cacheKey, response, 10);

    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

