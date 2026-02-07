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

      // Calculate user volume (convert from wei to USDT if stored in wei)
      let userVolumeUSDT = '0';
      if (user?.totalVolume) {
        // Check if it's already in USDT format (has decimal) or in wei
        const volumeStr = user.totalVolume;
        if (volumeStr.includes('.') || parseFloat(volumeStr) < 1e15) {
          // Already in USDT format
          userVolumeUSDT = volumeStr;
        } else {
          // In wei format, convert to USDT
          const volumeWei = BigInt(volumeStr);
          userVolumeUSDT = (Number(volumeWei) / 1e18).toString();
        }
      }
      
      return NextResponse.json({
        user: user ? {
          ...user,
          totalVolume: userVolumeUSDT,
        } : { address, ordersCreated: 0, ordersCompleted: 0, totalVolume: '0' },
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
    // sellAmount is stored in wei (18 decimals), need to convert to human-readable
    const completedOrdersData = await prisma.order.findMany({
      where: { status: 'COMPLETED' },
      select: { sellAmount: true },
    });

    // Convert from wei to USDT (divide by 10^18) and sum
    const totalVolumeWei = completedOrdersData.reduce((sum, order) => {
      const amountWei = BigInt(order.sellAmount || '0');
      return sum + amountWei;
    }, BigInt(0));
    
    // Convert to USDT (18 decimals)
    const totalVolumeUSDT = Number(totalVolumeWei) / 1e18;

    return NextResponse.json({
      totalOrders,
      openOrders,
      completedOrders,
      totalUsers,
      totalVolume: totalVolumeUSDT.toString(), // Already in USDT, not wei
      recentOrders,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

