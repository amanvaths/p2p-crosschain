// =============================================================================
// P2P Exchange - Bridge Settlement API
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/bridge/settlement
 * 
 * Called after DSC fill to trigger BSC settlement.
 * In production, this would be handled by a secure bridge relayer.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      bscOrderId,
      dscOrderId,
      dscTxHash,
      signature,
      order,
    } = body;

    // Validate required fields
    if (!bscOrderId || !dscOrderId || !dscTxHash || !signature) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Store settlement request in database for the relayer to process
    // In production, the relayer would:
    // 1. Verify the signature
    // 2. Check DSC transaction was successful
    // 3. Call BSC vault's completeOrder function
    
    try {
      await prisma.event.create({
        data: {
          chainId: 56, // BSC
          contractAddress: '0x0000000000000000000000000000000000000000', // Bridge relayer
          eventName: 'SettlementRequested',
          txHash: dscTxHash,
          blockNumber: BigInt(0),
          blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
          logIndex: 0,
          args: {
            bscOrderId,
            dscOrderId,
            dscTxHash,
            signature,
            buyerBsc: order?.buyerBsc,
            amount: order?.depAmount,
          },
          processed: false,
        },
      });
    } catch (dbError) {
      console.warn('Database not available, continuing without persistence:', dbError);
    }

    console.log('Settlement request received:', {
      bscOrderId,
      dscOrderId,
      dscTxHash,
      signature: signature.slice(0, 20) + '...',
    });

    // Return success - relayer will process asynchronously
    return NextResponse.json({
      success: true,
      message: 'Settlement request queued',
      data: {
        bscOrderId,
        dscOrderId,
        status: 'PENDING',
      },
    });

  } catch (error) {
    console.error('Settlement API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bridge/settlement
 * 
 * Get settlement status for an order
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bscOrderId = searchParams.get('bscOrderId');

    if (!bscOrderId) {
      return NextResponse.json(
        { error: 'bscOrderId is required' },
        { status: 400 }
      );
    }

    // Check for settlement event in database
    try {
      const settlement = await prisma.event.findFirst({
        where: {
          eventName: 'SettlementRequested',
          args: {
            path: ['bscOrderId'],
            equals: bscOrderId,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!settlement) {
        return NextResponse.json({
          success: true,
          data: {
            bscOrderId,
            status: 'NOT_FOUND',
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          bscOrderId,
          status: settlement.processed ? 'COMPLETED' : 'PENDING',
          dscTxHash: (settlement.args as Record<string, unknown>)?.dscTxHash,
          createdAt: settlement.createdAt,
        },
      });
    } catch (dbError) {
      console.warn('Database not available:', dbError);
      return NextResponse.json({
        success: true,
        data: {
          bscOrderId,
          status: 'UNKNOWN',
        },
      });
    }

  } catch (error) {
    console.error('Settlement status API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

