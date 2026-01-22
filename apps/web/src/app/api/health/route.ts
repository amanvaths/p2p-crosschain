// =============================================================================
// P2P Exchange - Health Check API Route
// =============================================================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import redis from '@/lib/redis';

export async function GET() {
  const health: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services = {
      ...(health.services as object),
      database: { status: 'ok' },
    };
  } catch (error) {
    health.status = 'degraded';
    health.services = {
      ...(health.services as object),
      database: { status: 'error', error: String(error) },
    };
  }

  // Check Redis
  try {
    await redis.ping();
    health.services = {
      ...(health.services as object),
      redis: { status: 'ok' },
    };
  } catch (error) {
    health.status = 'degraded';
    health.services = {
      ...(health.services as object),
      redis: { status: 'error', error: String(error) },
    };
  }

  const statusCode = health.status === 'ok' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

