// =============================================================================
// P2P Stats API - Platform and user statistics
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET - Fetch platform or user stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (address) {
      // User-specific stats
      const user = await prisma.user.findUnique({
        where: { address: address.toLowerCase() },
      });

      const [openOrders, completedOrders, pendingEscrows] = await Promise.all([
        prisma.order.count({
          where: { maker: address.toLowerCase(), status: 'OPEN' },
        }),
        prisma.order.count({
          where: { maker: address.toLowerCase(), status: 'COMPLETED' },
        }),
        prisma.escrow.count({
          where: { depositor: address.toLowerCase(), status: 'LOCKED' },
        }),
      ]);

      return NextResponse.json({
        user: user || { address, ordersCreated: 0, ordersCompleted: 0, totalVolume: '0' },
        openOrders,
        completedOrders,
        pendingEscrows,
      });
    }

    // Platform-wide stats
    const [
      totalOrders,
      openOrders,
      completedOrders,
      totalUsers,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'OPEN' } }),
      prisma.order.count({ where: { status: 'COMPLETED' } }),
      prisma.user.count(),
      prisma.order.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          sellAmount: true,
          buyAmount: true,
          createdAt: true,
        },
      }),
    ]);

    // Calculate total volume from completed orders
    const completedOrdersData = await prisma.order.findMany({
      where: { status: 'COMPLETED' },
      select: { sellAmount: true },
    });

    const totalVolume = completedOrdersData.reduce((sum, order) => {
      return sum + parseFloat(order.sellAmount || '0');
    }, 0);

    return NextResponse.json({
      totalOrders,
      openOrders,
      completedOrders,
      totalUsers,
      totalVolume: totalVolume.toString(),
      recentOrders,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

