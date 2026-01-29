// =============================================================================
// P2P Orders API - Database CRUD
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET - Fetch orders with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'buy' or 'sell'
    const status = searchParams.get('status'); // 'OPEN', 'COMPLETED', etc.
    const maker = searchParams.get('maker'); // Filter by user address
    const chainId = searchParams.get('chainId');
    const minAmount = searchParams.get('minAmount');
    const maxAmount = searchParams.get('maxAmount');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};

    if (status && status.toLowerCase() !== 'all') {
      // Convert to uppercase for Prisma enum
      where.status = status.toUpperCase();
    } else if (!status) {
      // Default to open orders when no status specified
      where.status = 'OPEN';
    }
    // When status is 'all', don't add status filter (show all statuses)

    if (maker) {
      where.maker = maker.toLowerCase();
    }

    if (chainId) {
      where.chainId = parseInt(chainId);
    }

    // Amount filter (sellAmount for sell orders, buyAmount for buy orders)
    if (minAmount || maxAmount) {
      where.sellAmount = {};
      if (minAmount) {
        where.sellAmount.gte = minAmount;
      }
      if (maxAmount) {
        where.sellAmount.lte = maxAmount;
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          escrows: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    // Serialize BigInt values to strings for JSON
    const serializedOrders = orders.map((order) => ({
      ...order,
      orderId: order.orderId.toString(),
      makerTimelock: order.makerTimelock.toString(),
      takerTimelock: order.takerTimelock.toString(),
      blockNumber: order.blockNumber.toString(),
      escrows: order.escrows?.map((escrow) => ({
        ...escrow,
        timelock: escrow.timelock.toString(),
        blockNumber: escrow.blockNumber.toString(),
      })),
    }));

    return NextResponse.json({
      orders: serializedOrders,
      total,
      limit,
      offset,
      hasMore: offset + orders.length < total,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderId,
      chainId,
      maker,
      sellToken,
      sellAmount,
      buyToken,
      buyAmount,
      srcChainId,
      dstChainId,
      hashLock,
      makerTimelock,
      takerTimelock,
      txHash,
      blockNumber,
      logIndex,
    } = body;

    // Validate required fields
    if (!orderId || !chainId || !maker || !sellToken || !sellAmount || !buyToken || !buyAmount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const order = await prisma.order.create({
      data: {
        orderId: BigInt(orderId),
        chainId,
        maker: maker.toLowerCase(),
        sellToken,
        sellAmount,
        buyToken,
        buyAmount,
        srcChainId,
        dstChainId,
        hashLock,
        makerTimelock: BigInt(makerTimelock),
        takerTimelock: BigInt(takerTimelock),
        txHash,
        blockNumber: BigInt(blockNumber),
        logIndex,
        status: 'OPEN',
      },
    });

    // Update user stats
    await prisma.user.upsert({
      where: { address: maker.toLowerCase() },
      update: {
        ordersCreated: { increment: 1 },
      },
      create: {
        address: maker.toLowerCase(),
        ordersCreated: 1,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

