// =============================================================================
// P2P Exchange Indexer - Escrow Event Processor
// =============================================================================

import type { Log, Address, Hash, Hex } from 'viem';
import { decodeEventLog, decodeFunctionData } from 'viem';
import { P2PEscrowHTLCABI } from '@p2p/shared';
import prisma from '../db.js';
import { getChainClient } from '../chains.js';
import { OrderStatus, EscrowStatus } from '@prisma/client';

interface ProcessedEvent {
  eventName: string;
  args: Record<string, unknown>;
  txHash: Hash;
  blockNumber: bigint;
  blockHash: Hash;
  logIndex: number;
}

export async function processEscrowEvent(
  chainId: number,
  contractAddress: Address,
  log: Log
): Promise<void> {
  // Decode the event
  let decoded: ProcessedEvent;

  try {
    const result = decodeEventLog({
      abi: P2PEscrowHTLCABI,
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
    console.error('Failed to decode escrow event:', error);
    return;
  }

  console.log(`Processing ${decoded.eventName} on chain ${chainId}`);

  // Store raw event first
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
    case 'Locked':
      await processLocked(chainId, decoded, event.id);
      break;

    case 'Claimed':
      await processClaimed(chainId, decoded, event.id);
      break;

    case 'Refunded':
      await processRefunded(chainId, decoded, event.id);
      break;

    default:
      console.warn(`Unknown escrow event: ${decoded.eventName}`);
  }

  // Mark event as processed
  await prisma.event.update({
    where: { id: event.id },
    data: { processed: true, processedAt: new Date() },
  });
}

async function processLocked(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    lockId: Hash;
    orderId: bigint;
    depositor: Address;
    recipient: Address;
    token: Address;
    amount: bigint;
    hashLock: Hash;
    timelock: bigint;
  };

  // Find the order by on-chain ID
  const order = await prisma.order.findUnique({
    where: { orderId: args.orderId },
  });

  if (!order) {
    console.warn(`Order ${args.orderId} not found for lock`);
    return;
  }

  // Determine if this is maker or taker lock
  const isMakerLock =
    args.depositor.toLowerCase() === order.maker.toLowerCase() &&
    chainId === order.srcChainId;

  // Create escrow record
  const escrow = await prisma.escrow.upsert({
    where: { lockId: args.lockId },
    create: {
      orderId: order.id,
      lockId: args.lockId,
      chainId,
      depositor: args.depositor.toLowerCase(),
      recipient: args.recipient.toLowerCase(),
      token: args.token.toLowerCase(),
      amount: args.amount.toString(),
      hashLock: args.hashLock,
      timelock: args.timelock,
      status: EscrowStatus.LOCKED,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
    },
    update: {
      status: EscrowStatus.LOCKED,
    },
  });

  // Update order status
  const newStatus = isMakerLock
    ? OrderStatus.MAKER_LOCKED
    : OrderStatus.TAKER_LOCKED;

  // Only update if progressing forward
  if (
    order.status === OrderStatus.OPEN ||
    (order.status === OrderStatus.MAKER_LOCKED && !isMakerLock)
  ) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: newStatus },
    });
  }

  // Link event to order
  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: order.id },
  });

  console.log(
    `Created ${isMakerLock ? 'maker' : 'taker'} escrow for order ${order.id}`
  );
}

async function processClaimed(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    lockId: Hash;
    orderId: bigint;
    recipient: Address;
    hashLock: Hash;
  };

  // Find the escrow
  const escrow = await prisma.escrow.findUnique({
    where: { lockId: args.lockId },
    include: { order: true },
  });

  if (!escrow) {
    console.warn(`Escrow ${args.lockId} not found for claim`);
    return;
  }

  // Extract secret from transaction calldata
  const secret = await extractSecretFromTx(chainId, event.txHash);

  // Update escrow
  await prisma.escrow.update({
    where: { id: escrow.id },
    data: {
      status: EscrowStatus.CLAIMED,
      secret,
      claimedTxHash: event.txHash,
    },
  });

  // Update order with secret if this is the first claim
  if (secret && !escrow.order.secret) {
    await prisma.order.update({
      where: { id: escrow.order.id },
      data: { secret },
    });
  }

  // Check if both escrows are claimed
  const allEscrows = await prisma.escrow.findMany({
    where: { orderId: escrow.order.id },
  });

  const allClaimed = allEscrows.every(
    (e) => e.status === EscrowStatus.CLAIMED
  );

  if (allClaimed && allEscrows.length >= 2) {
    await prisma.order.update({
      where: { id: escrow.order.id },
      data: { status: OrderStatus.COMPLETED },
    });
    console.log(`Order ${escrow.order.id} completed!`);
  }

  // Link event to order
  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: escrow.order.id },
  });

  console.log(`Escrow ${escrow.id} claimed`);
}

async function processRefunded(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    lockId: Hash;
    orderId: bigint;
    depositor: Address;
    hashLock: Hash;
  };

  // Find the escrow
  const escrow = await prisma.escrow.findUnique({
    where: { lockId: args.lockId },
    include: { order: true },
  });

  if (!escrow) {
    console.warn(`Escrow ${args.lockId} not found for refund`);
    return;
  }

  // Update escrow
  await prisma.escrow.update({
    where: { id: escrow.id },
    data: {
      status: EscrowStatus.REFUNDED,
      refundedTxHash: event.txHash,
    },
  });

  // Update order status
  await prisma.order.update({
    where: { id: escrow.order.id },
    data: { status: OrderStatus.REFUNDED },
  });

  // Link event to order
  await prisma.event.update({
    where: { id: eventId },
    data: { orderId: escrow.order.id },
  });

  console.log(`Escrow ${escrow.id} refunded`);
}

async function extractSecretFromTx(
  chainId: number,
  txHash: Hash
): Promise<string | null> {
  try {
    const client = getChainClient(chainId);
    const tx = await client.getTransaction({ hash: txHash });

    if (!tx.input || tx.input === '0x') {
      return null;
    }

    // Decode the claim function call
    const decoded = decodeFunctionData({
      abi: P2PEscrowHTLCABI,
      data: tx.input,
    });

    if (decoded.functionName === 'claim' && decoded.args) {
      // args[1] is the secret
      return decoded.args[1] as string;
    }

    return null;
  } catch (error) {
    console.error('Failed to extract secret from tx:', error);
    return null;
  }
}

export default processEscrowEvent;

