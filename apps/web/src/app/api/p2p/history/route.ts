// =============================================================================
// P2P History API - User's executed orders history
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET - Fetch user's executed order history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    // Fetch completed orders where user is maker
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          maker: address.toLowerCase(),
          status: {
            in: ['COMPLETED', 'REFUNDED'],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          escrows: true,
        },
      }),
      prisma.order.count({
        where: {
          maker: address.toLowerCase(),
          status: {
            in: ['COMPLETED', 'REFUNDED'],
          },
        },
      }),
    ]);

    // Also fetch orders where user participated as taker (via escrows)
    const takerEscrows = await prisma.escrow.findMany({
      where: {
        depositor: address.toLowerCase(),
        status: {
          in: ['CLAIMED', 'REFUNDED'],
        },
      },
      include: {
        order: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    // Combine and format history
    const history = [
      ...orders.map(order => ({
        id: order.id,
        type: 'sell', // User was maker (seller)
        orderId: order.orderId.toString(),
        amount: order.sellAmount,
        buyAmount: order.buyAmount,
        sellToken: order.sellToken,
        buyToken: order.buyToken,
        status: order.status,
        chainId: order.chainId,
        counterparty: null, // Could extract from escrow
        txHash: order.txHash,
        completedAt: order.updatedAt,
        createdAt: order.createdAt,
      })),
      ...takerEscrows.map(escrow => ({
        id: escrow.id,
        type: 'buy', // User was taker (buyer)
        orderId: escrow.order?.orderId?.toString(),
        amount: escrow.amount,
        buyAmount: escrow.order?.buyAmount,
        sellToken: escrow.token,
        buyToken: escrow.order?.buyToken,
        status: escrow.status === 'CLAIMED' ? 'COMPLETED' : escrow.status,
        chainId: escrow.chainId,
        counterparty: escrow.recipient,
        txHash: escrow.claimedTxHash || escrow.refundedTxHash || escrow.txHash,
        completedAt: escrow.updatedAt,
        createdAt: escrow.createdAt,
      })),
    ].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    return NextResponse.json({
      history: history.slice(0, limit),
      total: total + takerEscrows.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

