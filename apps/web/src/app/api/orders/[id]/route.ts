// =============================================================================
// P2P Exchange - Single Order API Route
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { checkRateLimit, getCached, setCache } from '@/lib/redis';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
    const rateLimit = await checkRateLimit(`order:${ip}`);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimit.resetIn },
        { status: 429 }
      );
    }

    // Check cache
    const cacheKey = `order:${id}`;
    const cached = await getCached(cacheKey);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        },
      });
    }

    // Fetch order
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        escrows: true,
        events: {
          orderBy: { blockNumber: 'asc' },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Transform for response
    const makerEscrow = order.escrows.find(
      (e) => e.chainId === order.srcChainId
    );
    const takerEscrow = order.escrows.find(
      (e) => e.chainId === order.dstChainId
    );

    const response = {
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
      events: undefined,
    };

    // Cache for 5 seconds
    await setCache(cacheKey, response, 5);

    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      },
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

