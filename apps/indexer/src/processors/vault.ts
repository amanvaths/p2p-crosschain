// =============================================================================
// P2P Exchange Indexer - Vault Event Processor
// Handles P2PVaultBSC and P2PVaultDSC events
// =============================================================================

import type { Log, Address, Hash } from "viem";
import { decodeEventLog } from "viem";
import { P2PVaultBSCABI, P2PVaultDSCABI } from "@p2p/shared";
import prisma from "../db.js";
import { OrderStatus } from "@prisma/client";
import { safeDbOperation } from "../connection-manager.js";
import { Prisma } from "@prisma/client";
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

// const safeArgs = safeJson(decoded.args);
export async function processBscVaultEvent(
  chainId: number,
  contractAddress: Address,
  log: Log
): Promise<void> {
  let decoded: any;
  console.log("line no 36 ================================");
  try {
    const result = decodeEventLog({
      abi: P2PVaultBSCABI,
      data: log.data,
      topics: log.topics,
    });

    console.log(result, "+++++++++++++++++++++++++++++++++++++++++++++++");

    decoded = {
      eventName: result.eventName,
      args: result.args as Record<string, unknown>,
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
      blockHash: log.blockHash!,
      logIndex: log.logIndex!,
    };
  } catch (error) {
    console.log(error, "Error in 55 in vault.ts");
    return;
  }

  console.log(`[BSC] Processing ${decoded.eventName}`);

  // Store raw event (with retry)
  const event = await safeDbOperation(async () => {
    return await prisma.event.upsert({
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
  }, `store BSC event ${decoded.eventName}`);

  // Process based on event type
  switch (decoded.eventName) {
    case "OrderCreated":
      await processBscOrderCreated(chainId, decoded, event.id);
      break;
    case "OrderCancelled":
      await processBscOrderCancelled(decoded, event.id);
      break;
    case "OrderFilled":
      await processBscOrderMatched(decoded, event.id);
      break;
    case "OrderCompleted":
      await processBscOrderCompleted(decoded, event.id);
      break;
    case "OrderRefunded":
      await processBscOrderRefunded(decoded, event.id);
      break;
  }

  await safeDbOperation(async () => {
    await prisma.event.update({
      where: { id: event.id },
      data: { processed: true, processedAt: new Date() },
    });
  }, `mark BSC event ${decoded.eventName} as processed`);
}

async function processBscOrderCreated(
  chainId: number,
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    user: Address;
    amount: bigint;
    expiresAt: bigint;
  };

  const existing = await safeDbOperation(async () => {
    return await prisma.order.findUnique({
      where: { orderId: args.orderId },
    });
  }, `check existing BSC order ${args.orderId}`);

  if (existing) {
    console.log(`Order ${args.orderId} already exists`);
    return;
  }

  // Create order - BUY order on BSC (with retry)
  const order = await safeDbOperation(async () => {
    return await prisma.order.create({
      data: {
        orderId: args.orderId,
        chainId,
        maker: args.user.toLowerCase(),
        sellToken: "0x55d398326f99059ff775485246999027b3197955", // BSC USDT
        sellAmount: args.amount.toString(),
        buyToken: "0xbc27aceac6865de31a286cd9057564393d5251cb", // DSC USDT
        buyAmount: args.amount.toString(),
        srcChainId: BSC_CHAIN_ID,
        dstChainId: DSC_CHAIN_ID,
        hashLock:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        makerTimelock: args.expiresAt,
        takerTimelock: args.expiresAt,
        status: OrderStatus.OPEN,
        cancelled: false,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
      },
    });
  }, `create BSC order ${args.orderId}`);

  await safeDbOperation(async () => {
    await prisma.event.update({
      where: { id: eventId },
      data: { orderId: order.id },
    });
  }, `link event to BSC order`);

  // Update user stats (with retry)
  await safeDbOperation(async () => {
    await prisma.user.upsert({
      where: { address: args.user.toLowerCase() },
      create: {
        address: args.user.toLowerCase(),
        ordersCreated: 1,
      },
      update: {
        ordersCreated: { increment: 1 },
      },
    });
  }, `update user stats for BSC order`);

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

// async function processBscOrderMatched(
//   event: ProcessedEvent,
//   eventId: string
// ): Promise<void> {
//   try {
//     const args = event.args as {
//       dscOrderId: bigint;
//       filler: Address;
//       amount: bigint;
//       isPartial: Boolean;
//     };
//     console.log(
//       { args },
//       "=>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> process order filled"
//     );
//     const uniqueOrderId = args.dscOrderId + BigInt(1000000);

//     const order = await safeDbOperation(async () => {
//       return await prisma.order.findUnique({
//         where: { orderId: uniqueOrderId },
//       });
//     }, `find order ${uniqueOrderId} for match`);

//     if (!order) {
//       console.warn(`Order ${uniqueOrderId} not found for match`);
//       return;
//     }

//     // For BSC orders: maker is buyer, taker is seller
//     await safeDbOperation(async () => {
//       await prisma.order.update({
//         where: { id: order.id },
//         data: {
//           status: OrderStatus.MAKER_LOCKED,
//           takerAddress: args.filler.toLowerCase(), // Store taker address
//         },
//       });
//     }, `update order ${order.id} status and taker`);

//     await safeDbOperation(async () => {
//       await prisma.event.update({
//         where: { id: eventId },
//         data: { orderId: order.id },
//       });
//     }, `link event ${eventId} to order ${order.id}`);

//     console.log(`Matched order ${order.id} with taker ${args.filler}`);
//   } catch (error) {
//     console.log(error, "error in line 270");
//   }
// }

async function processBscOrderMatched(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  try {
    const args = event.args as {
      dscOrderId: bigint;
      bscOrderId: bigint;
      filler: Address;
      amount: bigint;
      isPartial: boolean;
    };

    const uniqueOrderId = args.bscOrderId;

    const order = await safeDbOperation(async () => {
      return await prisma.order.findUnique({
        where: { orderId: uniqueOrderId },
      });
    }, `find order ${uniqueOrderId}`);

    if (!order) return;

    if (args.isPartial) {
      // await safeDbOperation(async () => {
      //   await prisma.order.update({
      //     where: { id: order.id },
      //     data: {
      //       status: OrderStatus.PARTIALLY_FILLED,
      //       takerAddress: args.filler.toLowerCase(),
      //     },
      //   });
      // }, `update order ${order.id} partial`);
    } else {
      await safeDbOperation(async () => {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.COMPLETED,
            takerAddress: args.filler.toLowerCase(),
          },
        });
      }, `update order ${order.id} complete`);
    }

    await safeDbOperation(async () => {
      await prisma.event.update({
        where: { id: eventId },
        data: { orderId: order.id },
      });
    }, `link event ${eventId}`);
  } catch (error) {
    console.log(error);
  }
}

async function processBscOrderCompleted(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    orderId: bigint;
    user: Address;
    seller: Address;
    amount: bigint;
    dscTxHash: Hash;
  };
  console.log({ args }, "bsc order completed=>>>>>>>");
  const order = await safeDbOperation(async () => {
    return await prisma.order.findUnique({
      where: { orderId: args.orderId },
    });
  }, `find order ${args.orderId} for completion`);

  if (!order) {
    console.warn(`Order ${args.orderId} not found for completion`);
    return;
  }

  // For BSC orders: maker is buyer, taker is seller
  // Update order status and taker address if not already set
  await safeDbOperation(async () => {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.COMPLETED,
        takerAddress: args.user.toLowerCase(), // Store taker address if not already set
      },
    });
  }, `update order ${order.id} to completed`);

  // Update user stats
  try {
    await safeDbOperation(async () => {
      await prisma.user.update({
        where: { address: args.user.toLowerCase() },
        data: {
          ordersCompleted: { increment: 1 },
          totalVolume: {
            set: (
              BigInt(order.sellAmount) +
              BigInt(await getUserVolume(args.user.toLowerCase()))
            ).toString(),
          },
        },
      });
    }, `update user stats for ${args.user}`);
  } catch (error) {
    // User might not exist, that's okay
    console.log(`User ${args.user} not found for stats update`);
  }

  await safeDbOperation(async () => {
    await prisma.event.update({
      where: { id: eventId },
      data: { orderId: order.id },
    });
  }, `link event ${eventId} to order ${order.id}`);

  console.log(`Completed order ${order.id} with taker ${args.user}`);
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
  let decoded: any;

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
    console.log(error, "in line 390");
    // Not a vault event, skip
    return;
  }

  console.log(
    `[DSC] Processing ${decoded.eventName}=>>>>>>>>>>>>>>>>>>>>>>>>>>>>`
  );
  console.log(decoded.args, "decoded.args =>?????????????");
  // Store raw event (with retry)
  const event = await safeDbOperation(async () => {
    return await prisma.event.upsert({
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
  }, `store DSC event ${decoded.eventName}`);
  // console.log(
  //   "At line no 425=>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>",
  //   decoded.eventName
  // );
  // Process based on event type
  switch (decoded.eventName) {
    case "OrderCreated":
      await processDscSellOrderCreated(chainId, decoded, event.id);
      break;
    case "OrderFilled":
      await processDscDirectFill(decoded, event.id);
      break;
    case "OrderCancelled":
      await processDscOrderCancelled(decoded, event.id);
      break;
    case "OrderCompleted":
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
  console.log("in processDscSellOrderCreated", "=>>>>>>>>>>>>>>>>>>>>>>");
  const args = event.args as {
    orderId: bigint;
    user: Address;
    amount: bigint;
    expiresAt: bigint;
    linkedBscOrderId: bigint;
  };

  // Use a unique ID combining chain and orderId
  const uniqueOrderId = args.orderId + BigInt(1000000); // Offset to avoid collision with BSC orders
  console.log(uniqueOrderId, "line no 462=================");
  const existing = await prisma.order.findUnique({
    where: { orderId: uniqueOrderId },
  });
  // console.log(existing, "line no 4666asdf");
  if (existing) {
    console.log(`DSC Order ${args.orderId} already exists 468`);
    return;
  }

  // Create order - SELL order on DSC (with retry)
  const order = await safeDbOperation(async () => {
    return await prisma.order.create({
      data: {
        orderId: uniqueOrderId,
        chainId,
        maker: args.user.toLowerCase(),
        sellToken: "0xbc27aceac6865de31a286cd9057564393d5251cb", // DSC USDT
        sellAmount: args.amount.toString(),
        buyToken: "0x55d398326f99059ff775485246999027b3197955", // BSC USDT
        buyAmount: args.amount.toString(),
        srcChainId: DSC_CHAIN_ID,
        dstChainId: BSC_CHAIN_ID,
        hashLock:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        makerTimelock: args.expiresAt,
        takerTimelock: args.expiresAt,
        status:
          args.linkedBscOrderId == 0n
            ? OrderStatus.OPEN
            : OrderStatus.MAKER_LOCKED,
        cancelled: false,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        logIndex: event.logIndex,
      },
    });
  }, `create DSC order ${args.orderId}`);

  await safeDbOperation(async () => {
    await prisma.event.update({
      where: { id: eventId },
      data: { orderId: order.id },
    });
  }, `link event to DSC order`);

  // Update user stats (with retry)
  await safeDbOperation(async () => {
    await prisma.user.upsert({
      where: { address: args.user.toLowerCase() },
      create: {
        address: args.user.toLowerCase(),
        ordersCreated: 1,
      },
      update: {
        ordersCreated: { increment: 1 },
      },
    });
  }, `update user stats for DSC order`);

  console.log(`Created DSC sell order ${order.id} (on-chain: ${args.orderId})`);
}

async function processDscDirectFill(
  event: ProcessedEvent,
  eventId: string
): Promise<void> {
  const args = event.args as {
    dscOrderId: bigint;
    bscOrderId: bigint;
    recipient: Address;
    isPartial: Boolean;
    amount: bigint;
  };

  console.log({ args }, "=>>>>>>>>> orderfilled");
  const uniqueOrderId = args.dscOrderId + BigInt(1000000);

  // Find the BSC order that's being filled
  const bscOrder = await prisma.order.findUnique({
    where: { orderId: uniqueOrderId },
  });

  if (bscOrder && args.isPartial == false) {
    await prisma.order.update({
      where: { id: bscOrder.id },
      data: { status: OrderStatus.COMPLETED },
    });
  }

  console.log(
    `Direct fill: DSC order ${args.dscOrderId} filling BSC order ${args.bscOrderId}`
  );
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
  try {
    const args = event.args as {
      orderId: bigint;
      user: Address;
      totalAmount: bigint;
      bscTxHash: Hash;
    };
    const uniqueOrderId = args.orderId + BigInt(1000000);
    console.log(
      args,
      uniqueOrderId,
      "processDscOrderCompleted================"
    );
    // Complete both orders
    const bscOrder = await safeDbOperation(async () => {
      return await prisma.order.findUnique({
        where: { orderId: BigInt(uniqueOrderId) },
      });
    }, `find BSC order ${uniqueOrderId} for DSC completion`);

    if (bscOrder) {
      await safeDbOperation(async () => {
        await prisma.order.update({
          where: { id: bscOrder.id },
          data: {
            status: OrderStatus.COMPLETED,
            takerAddress: args.user.toLowerCase(), // Store taker address
          },
        });
      }, `update BSC order ${bscOrder.id} to completed with taker`);

      // Link event to order
      await safeDbOperation(async () => {
        await prisma.event.update({
          where: { id: eventId },
          data: { orderId: bscOrder.id },
        });
      }, `link DSC completion event to BSC order ${bscOrder.id}`);
    }
  } catch (error) {
    console.log(error);
  }
  // console.log(
  //   `Completed cross-chain trade: BSC ${args.bscOrderId} <-> DSC ${args.dscOrderId} with taker ${args.user}`
  // );
}

// Helper function to get user's current volume
async function getUserVolume(address: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { address },
  });
  return user?.totalVolume ?? "0";
}

export default { processBscVaultEvent, processDscVaultEvent };
