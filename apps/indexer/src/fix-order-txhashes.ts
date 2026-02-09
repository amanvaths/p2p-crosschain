// Fix order txHashes by fetching OrderCreated events from blockchain
import "dotenv/config";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { config } from "./config.js";
import prisma from "./db.js";
import { reconnectDatabase } from "./connection-manager.js";
import { P2PVaultBSCABI } from "@p2p/shared";

const BSC_CHAIN_ID = 56;

async function fixOrderTxHashes() {
  await reconnectDatabase();

  const bscConfig = config.chains.find((c) => c.chainId === BSC_CHAIN_ID);
  if (!bscConfig) {
    console.error("BSC config not found");
    return;
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(bscConfig.rpcUrl),
  });

  console.log("🔍 Fixing order txHashes from blockchain...\n");

  try {
    // Get all orders with placeholder txHash
    const ordersWithPlaceholder = await prisma.order.findMany({
      where: {
        chainId: BSC_CHAIN_ID,
        txHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      },
      orderBy: { orderId: "asc" },
    });

    console.log(
      `📦 Found ${ordersWithPlaceholder.length} orders with placeholder txHash\n`
    );

    if (ordersWithPlaceholder.length === 0) {
      console.log("✅ No orders to fix");
      return;
    }

    let fixed = 0;
    let notFound = 0;

    // Get contract deployment block or start from a reasonable block
    const startBlock = bscConfig.startBlock;
    const currentBlock = await client.getBlockNumber();

    console.log(
      `📡 Searching for OrderCreated events from block ${startBlock} to ${currentBlock}...\n`
    );

    // Fetch OrderCreated events in batches
    const batchSize = 5000n;
    let fromBlock = startBlock;
    const allEvents: Array<{
      orderId: bigint;
      txHash: string;
      blockNumber: bigint;
    }> = [];

    while (fromBlock < currentBlock) {
      const toBlock =
        fromBlock + batchSize > currentBlock
          ? currentBlock
          : fromBlock + batchSize;
      console.log(bscConfig.orderbookAddress, "bscConfig.orderbookAddress");
      try {
        const logs = await client.getLogs({
          address: bscConfig.orderbookAddress,
          event: {
            type: "event",
            name: "OrderCreated",
            inputs: [
              { name: "orderId", type: "uint256", indexed: true },
              { name: "buyer", type: "address", indexed: true },
              { name: "amount", type: "uint256", indexed: false },
              { name: "expiresAt", type: "uint256", indexed: false },
            ],
          },
          fromBlock,
          toBlock,
        });

        for (const log of logs) {
          const decoded = log.args as any;
          if (decoded.orderId) {
            allEvents.push({
              orderId: decoded.orderId,
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
            });
          }
        }

        console.log(
          `  Processed blocks ${fromBlock}-${toBlock}: Found ${logs.length} OrderCreated events`
        );
      } catch (error: any) {
        if (error.message?.includes("too large")) {
          // Split into smaller chunks
          const midBlock = (fromBlock + toBlock) / 2n;
          fromBlock = midBlock;
          continue;
        }
        console.error(
          `  Error fetching logs for ${fromBlock}-${toBlock}:`,
          error.message
        );
      }

      fromBlock = toBlock + 1n;
    }

    console.log(`\n📊 Total OrderCreated events found: ${allEvents.length}\n`);

    // Create a map of orderId -> txHash
    const orderIdToTxHash = new Map<bigint, string>();
    allEvents.forEach((event) => {
      orderIdToTxHash.set(event.orderId, event.txHash);
    });

    // Update orders
    for (const order of ordersWithPlaceholder) {
      const txHash = orderIdToTxHash.get(order.orderId);

      if (
        txHash &&
        txHash !==
          "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        await prisma.order.update({
          where: { id: order.id },
          data: { txHash },
        });
        console.log(
          `  ✅ Fixed order ${order.orderId}: ${txHash.slice(0, 20)}...`
        );
        fixed++;
      } else {
        console.log(
          `  ⚠️  Order ${order.orderId}: Event not found on blockchain`
        );
        notFound++;
      }
    }

    console.log(`\n✅ Fix complete!`);
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Not found: ${notFound}`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixOrderTxHashes();
