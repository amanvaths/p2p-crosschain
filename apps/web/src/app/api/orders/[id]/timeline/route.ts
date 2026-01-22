// =============================================================================
// P2P Exchange - Order Timeline API Route
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
    const rateLimit = await checkRateLimit(`timeline:${ip}`);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimit.resetIn },
        { status: 429 }
      );
    }

    // Check cache
    const cacheKey = `timeline:${id}`;
    const cached = await getCached(cacheKey);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        },
      });
    }

    // Fetch order with events
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { blockNumber: 'asc' },
        },
        escrows: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Build timeline from events
    const timeline = order.events
      .filter((e) => !e.removed)
      .map((event) => ({
        timestamp: event.createdAt,
        event: event.eventName,
        chainId: event.chainId,
        txHash: event.txHash,
        details: event.args as Record<string, unknown>,
      }));

    const response = {
      orderId: order.id,
      timeline,
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
    console.error('Error fetching timeline:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

