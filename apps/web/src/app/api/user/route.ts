// =============================================================================
// User API - Get/Create User
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET - Get user by address
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() },
      include: {
        watchlist: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create or update user (login)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { address: address.toLowerCase() },
      update: {
        updatedAt: new Date(),
      },
      create: {
        address: address.toLowerCase(),
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

