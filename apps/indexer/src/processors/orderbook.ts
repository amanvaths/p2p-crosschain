// =============================================================================
// P2P Exchange Indexer - Orderbook Event Processor
// =============================================================================

import type { Log, Address, Hash } from 'viem';
import { decodeEventLog } from 'viem';
import { P2POrderbookABI } from '@p2p/shared';
import prisma from '../db.js';
import { OrderStatus } from '@prisma/client';

interface ProcessedEvent {
  eventName: string;
  args: Record<string, unknown>;
  txHash: Hash;
  blockNumber: bigint;
  blockHash: Hash;
  logIndex: number;
}

export async function processOrderbookEvent(
  chainId: number,
  contractAddress: Address,
  log: Log
): Promise<void> {
  // Decode the event
  let decoded: ProcessedEvent;

  try {
    const result = decodeEventLog({
      abi: P2POrderbookABI,
      data: log.data,
      topics: log.topics,
    });

    decoded = {
      eventName: result.eventName,
      args: result.args as Record<string, unknown>,
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
      blockHash: log.blockHash!,
      logIndex: log.logIndex!,
    };
  } catch (error) {
    console.error('Failed to decode orderbook event:', error);
    return;
  }

  console.log(`Processing ${decoded.eventName} on chain ${chainId}`);

  // Store raw event first (for reorg tolerance)
  const event = await prisma.event.upsert({
    where: {
      chainId_txHash_logIndex: {
        chainId,
        txHash: decoded.txHash,
        logIndex: decoded.logIndex,
      },
    },
    create: {
      chainId,
      contractAddress,
      eventName: decoded.eventName,
      txHash: decoded.txHash,
      blockNumber: decoded.blockNumber,
      blockHash: decoded.blockHash,
      logIndex: decoded.logIndex,
      args: decoded.args,
      processed: false,
    },
    update: {
      args: decoded.args,
      blockHash: decoded.blockHash,
      removed: false,
    },
  });

  // Process based on event type
  switch (decoded.eventName) {
    case 'OrderCreated':
      await processOrderCreated(chainId, decoded, event.id);
      break;

    case 'OrderCancelled':
      await processOrderCancelled(chainId, decoded, event.id);
      break;

    default:
      console.warn(`Unknown orderbook event: ${decoded.eventName}`);
  }

  // Mark event as processed
  await prisma.event.update({
    where: { id: event.id },
    data: { processed: true, processedAt: new Date() },
  });
}

async function processOrderCreated(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    maker: Address;
    sellToken: Address;
    sellAmount: bigint;
    buyToken: Address;
    buyAmount: bigint;
    srcChainId: bigint;
    dstChainId: bigint;
    hashLock: Hash;
    makerTimelock: bigint;
    takerTimelock: bigint;
  };

  // Check if order already exists
  const existing = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (existing) {
    console.log(`Order ${args.orderId} already exists, skipping`);
    return;
  }

  // Create order record
  const order = await prisma.order.create({
    data: {
      orderId: args.orderId,
      chainId,
      maker: args.maker.toLowerCase(),
      sellToken: args.sellToken.toLowerCase(),
      sellAmount: args.sellAmount.toString(),
      buyToken: args.buyToken.toLowerCase(),
      buyAmount: args.buyAmount.toString(),
      srcChainId: Number(args.srcChainId),
      dstChainId: Number(args.dstChainId),
      hashLock: args.hashLock,
      makerTimelock: args.makerTimelock,
      takerTimelock: args.takerTimelock,
      status: OrderStatus.OPEN,
      cancelled: false,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
    },
  });

  // Link event to order
  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  console.log(`Created order ${order.id} (on-chain ID: ${args.orderId})`);
}

async function processOrderCancelled(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    maker: Address;
  };

  // Find and update order
  const order = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (!order) {
    console.warn(`Order ${args.orderId} not found for cancellation`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.CANCELLED,
      cancelled: true,
    },
  });

  // Link event to order
  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  console.log(`Cancelled order ${order.id}`);
}

export default processOrderbookEvent;

