// =============================================================================
// P2P Exchange Indexer - Vault Event Processor
// Handles P2PVaultBSC and P2PVaultDSC events
// =============================================================================

import type { Log, Address, Hash } from 'viem';
import { decodeEventLog } from 'viem';
import { P2PVaultBSCABI, P2PVaultDSCABI } from '@p2p/shared';
import prisma from '../db.js';
import { OrderStatus } from '@prisma/client';

// BSC Chain ID
const BSC_CHAIN_ID = 56;
const DSC_CHAIN_ID = 1555;

interface ProcessedEvent {
  eventName: string;
  args: Record<string, unknown>;
  txHash: Hash;
  blockNumber: bigint;
  blockHash: Hash;
  logIndex: number;
}

// =============================================================================
// Process BSC Vault Events (Buy Orders)
// =============================================================================

export async function processBscVaultEvent(
  chainId: number,
  contractAddress: Address,
  log: Log
): Promise<void> {
  let decoded: ProcessedEvent;

  try {
    const result = decodeEventLog({
      abi: P2PVaultBSCABI,
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
    // Not a vault event, skip
    return;
  }

  console.log(`[BSC] Processing ${decoded.eventName}`);

  // Store raw event
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
      await processBscOrderCreated(chainId, decoded, event.id);
      break;
    case 'OrderCancelled':
      await processBscOrderCancelled(decoded, event.id);
      break;
    case 'OrderMatched':
      await processBscOrderMatched(decoded, event.id);
      break;
    case 'OrderCompleted':
      await processBscOrderCompleted(decoded, event.id);
      break;
    case 'OrderRefunded':
      await processBscOrderRefunded(decoded, event.id);
      break;
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { processed: true, processedAt: new Date() },
  });
}

async function processBscOrderCreated(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    buyer: Address;
    amount: bigint;
    expiresAt: bigint;
  };

  const existing = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (existing) {
    console.log(`Order ${args.orderId} already exists`);
    return;
  }

  // Create order - BUY order on BSC
  const order = await prisma.order.create({
    data: {
      orderId: args.orderId,
      chainId,
      maker: args.buyer.toLowerCase(),
      sellToken: '0x55d398326f99059ff775485246999027b3197955', // BSC USDT
      sellAmount: args.amount.toString(),
      buyToken: '0xbc27aceac6865de31a286cd9057564393d5251cb', // DSC USDT
      buyAmount: args.amount.toString(),
      srcChainId: BSC_CHAIN_ID,
      dstChainId: DSC_CHAIN_ID,
      hashLock: '0x0000000000000000000000000000000000000000000000000000000000000000',
      makerTimelock: args.expiresAt,
      takerTimelock: args.expiresAt,
      status: OrderStatus.OPEN,
      cancelled: false,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
    },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  // Update user stats
  await prisma.user.upsert({
    where: { address: args.buyer.toLowerCase() },
    create: {
      address: args.buyer.toLowerCase(),
      ordersCreated: 1,
    },
    update: {
      ordersCreated: { increment: 1 },
    },
  });

  console.log(`Created BSC buy order ${order.id} (on-chain: ${args.orderId})`);
}

async function processBscOrderCancelled(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    buyer: Address;
    amount: bigint;
  };

  const order = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (!order) {
    console.warn(`Order ${args.orderId} not found for cancellation`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CANCELLED, cancelled: true },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  console.log(`Cancelled order ${order.id}`);
}

async function processBscOrderMatched(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    buyer: Address;
    seller: Address;
    amount: bigint;
  };

  const order = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (!order) {
    console.warn(`Order ${args.orderId} not found for match`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.MAKER_LOCKED },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  console.log(`Matched order ${order.id}`);
}

async function processBscOrderCompleted(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    buyer: Address;
    seller: Address;
    amount: bigint;
    dscTxHash: Hash;
  };

  const order = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (!order) {
    console.warn(`Order ${args.orderId} not found for completion`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.COMPLETED },
  });

  // Update user stats
  await prisma.user.update({
    where: { address: args.buyer.toLowerCase() },
    data: {
      ordersCompleted: { increment: 1 },
      totalVolume: {
        set: (BigInt(order.sellAmount) + BigInt(await getUserVolume(args.buyer.toLowerCase()))).toString(),
      },
    },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  console.log(`Completed order ${order.id}`);
}

async function processBscOrderRefunded(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    buyer: Address;
    amount: bigint;
  };

  const order = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (!order) {
    console.warn(`Order ${args.orderId} not found for refund`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.REFUNDED },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  console.log(`Refunded order ${order.id}`);
}

// =============================================================================
// Process DSC Vault Events (Sell Orders)
// =============================================================================

export async function processDscVaultEvent(
  chainId: number,
  contractAddress: Address,
  log: Log
): Promise<void> {
  let decoded: ProcessedEvent;

  try {
    const result = decodeEventLog({
      abi: P2PVaultDSCABI,
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
    // Not a vault event, skip
    return;
  }

  console.log(`[DSC] Processing ${decoded.eventName}`);

  // Store raw event
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
    case 'SellOrderCreated':
      await processDscSellOrderCreated(chainId, decoded, event.id);
      break;
    case 'DirectFillCreated':
      await processDscDirectFill(decoded, event.id);
      break;
    case 'OrderCancelled':
      await processDscOrderCancelled(decoded, event.id);
      break;
    case 'OrderCompleted':
      await processDscOrderCompleted(decoded, event.id);
      break;
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { processed: true, processedAt: new Date() },
  });
}

async function processDscSellOrderCreated(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    seller: Address;
    amount: bigint;
    expiresAt: bigint;
  };

  // Use a unique ID combining chain and orderId
  const uniqueOrderId = args.orderId + BigInt(1000000); // Offset to avoid collision with BSC orders

  const existing = await prisma.order.findUnique({
    where: { orderId: uniqueOrderId },
  });

  if (existing) {
    console.log(`DSC Order ${args.orderId} already exists`);
    return;
  }

  // Create order - SELL order on DSC
  const order = await prisma.order.create({
    data: {
      orderId: uniqueOrderId,
      chainId,
      maker: args.seller.toLowerCase(),
      sellToken: '0xbc27aceac6865de31a286cd9057564393d5251cb', // DSC USDT
      sellAmount: args.amount.toString(),
      buyToken: '0x55d398326f99059ff775485246999027b3197955', // BSC USDT
      buyAmount: args.amount.toString(),
      srcChainId: DSC_CHAIN_ID,
      dstChainId: BSC_CHAIN_ID,
      hashLock: '0x0000000000000000000000000000000000000000000000000000000000000000',
      makerTimelock: args.expiresAt,
      takerTimelock: args.expiresAt,
      status: OrderStatus.OPEN,
      cancelled: false,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
    },
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  // Update user stats
  await prisma.user.upsert({
    where: { address: args.seller.toLowerCase() },
    create: {
      address: args.seller.toLowerCase(),
      ordersCreated: 1,
    },
    update: {
      ordersCreated: { increment: 1 },
    },
  });

  console.log(`Created DSC sell order ${order.id} (on-chain: ${args.orderId})`);
}

async function processDscDirectFill(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    dscOrderId: bigint;
    bscOrderId: bigint;
    seller: Address;
    buyer: Address;
    amount: bigint;
  };

  // Find the BSC order that's being filled
  const bscOrder = await prisma.order.findUnique({
    where: { orderId: args.bscOrderId },
  });

  if (bscOrder) {
    await prisma.order.update({
      where: { id: bscOrder.id },
      data: { status: OrderStatus.TAKER_LOCKED },
    });
  }

  console.log(`Direct fill: DSC order ${args.dscOrderId} filling BSC order ${args.bscOrderId}`);
}

async function processDscOrderCancelled(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    seller: Address;
    amount: bigint;
  };

  const uniqueOrderId = args.orderId + BigInt(1000000);
  
  const order = await prisma.order.findUnique({
    where: { orderId: uniqueOrderId },
  });

  if (!order) {
    console.warn(`DSC Order ${args.orderId} not found for cancellation`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CANCELLED, cancelled: true },
  });

  console.log(`Cancelled DSC order ${order.id}`);
}

async function processDscOrderCompleted(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    dscOrderId: bigint;
    bscOrderId: bigint;
    seller: Address;
    buyer: Address;
    amount: bigint;
    bscTxHash: Hash;
  };

  // Complete both orders
  const bscOrder = await prisma.order.findUnique({
    where: { orderId: args.bscOrderId },
  });

  if (bscOrder) {
    await prisma.order.update({
      where: { id: bscOrder.id },
      data: { status: OrderStatus.COMPLETED },
    });
  }

  console.log(`Completed cross-chain trade: BSC ${args.bscOrderId} <-> DSC ${args.dscOrderId}`);
}

// Helper function to get user's current volume
async function getUserVolume(address: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { address },
  });
  return user?.totalVolume ?? '0';
}

export default { processBscVaultEvent, processDscVaultEvent };
