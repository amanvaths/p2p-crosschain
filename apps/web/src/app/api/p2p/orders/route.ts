import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import {
  P2PVaultBSCABI,
  P2PVaultDSCABI,
  getContractAddress,
  BSC_CHAIN_ID,
  DSC_CHAIN_ID,
} from "@/lib/contracts";
const dscChain = {
  id: 1555,
  name: "DSC Chain",
  nativeCurrency: {
    decimals: 18,
    name: "DSC",
    symbol: "DSC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc01.dscscan.io/"],
    },
  },
  blockExplorers: {
    default: { name: "DSCScan", url: "https://dscscan.io" },
  },
} as const;

// GET - Fetch orders with filters
export async function GET(request: NextRequest) {
  try {
    // Check if takerAddress column exists by trying a simple query
    let hasTakerAddressColumn = false;
    try {
      await prisma.$queryRaw`SELECT "takerAddress" FROM "orders" LIMIT 1`;
      hasTakerAddressColumn = true;
    } catch (error: any) {
      // Column doesn't exist, will extract from events
      hasTakerAddressColumn = false;
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // 'buy' or 'sell'
    const status = searchParams.get("status"); // 'OPEN', 'COMPLETED', etc.
    const maker = searchParams.get("maker"); // Filter by user address
    const chainId = searchParams.get("chainId");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build where clause
    const where: any = {};

    if (status && status.toLowerCase() !== "all") {
      // Convert to uppercase for Prisma enum
      where.status = status.toUpperCase();
    }
    // When status is 'all' or not specified, don't add status filter (show all statuses)

    if (maker) {
      where.maker = maker.toLowerCase();
    }

    if (chainId) {
      where.chainId = parseInt(chainId);
    }

    // Amount filter (sellAmount for sell orders, buyAmount for buy orders)
    if (minAmount || maxAmount) {
      where.sellAmount = {};
      if (minAmount) {
        where.sellAmount.gte = minAmount;
      }
      if (maxAmount) {
        where.sellAmount.lte = maxAmount;
      }
    }

    // Fetch orders - use include instead of select to avoid column issues
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          escrows: true,
          events: {
            where: {
              OR: [
                { orderId: { not: null } }, // Events linked via orderId
                {
                  // Or events that match this order by orderId in args
                  eventName: {
                    in: [
                      "OrderCreated",
                      "OrderMatched",
                      "OrderCompleted",
                      "OrderCancelled",
                      "OrderRefunded",
                    ],
                  },
                },
              ],
            },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              eventName: true,
              txHash: true,
              chainId: true,
              args: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // Also fetch events by orderId from args for ALL orders (not just those without linked events)
    // This ensures we get events even if they're not properly linked via orderId foreign key
    const ordersWithEvents = await Promise.all(
      orders.map(async (order) => {
        const orderIdStr = order.orderId.toString();
        const orderIdNum = Number(order.orderId);

        // Always try to find events by searching in args
        // This handles cases where events exist but aren't linked via foreign key
        try {
          const relatedEvents = await prisma.$queryRaw<any[]>`
          SELECT id, "eventName", "txHash", "chainId", args, "createdAt"
          FROM events
          WHERE (
            "chainId" = ${order.chainId}
            OR "chainId" = ${order.srcChainId}
            OR "chainId" = ${order.dstChainId}
          )
            AND "eventName" IN ('OrderCreated', 'OrderMatched', 'OrderCompleted', 'OrderCancelled', 'OrderRefunded')
            AND (
              args::text LIKE ${`%"orderId":${orderIdStr}%`}
              OR args::text LIKE ${`%"orderId":"${orderIdStr}"%`}
              OR args::text LIKE ${`%"bscOrderId":${orderIdStr}%`}
              OR args::text LIKE ${`%"bscOrderId":"${orderIdStr}"%`}
              OR args::text LIKE ${`%"dscOrderId":${orderIdStr}%`}
              OR args::text LIKE ${`%"dscOrderId":"${orderIdStr}"%`}
              OR (args->>'orderId')::bigint = ${order.orderId}
              OR (args->>'bscOrderId')::bigint = ${order.orderId}
              OR (args->>'dscOrderId')::bigint = ${order.orderId}
            )
          ORDER BY "createdAt" ASC
        `;

          // Merge with existing events from relation, avoiding duplicates
          const existingEventIds = new Set(
            (order.events || []).map((e: any) => e.id)
          );
          const newEvents = relatedEvents
            .filter((e: any) => !existingEventIds.has(e.id))
            .map((e: any) => ({
              id: e.id,
              eventName: e.eventName,
              txHash: e.txHash,
              chainId: e.chainId,
              args: e.args,
              createdAt: e.createdAt,
            }));

          return {
            ...order,
            events: [...(order.events || []), ...newEvents],
          };
        } catch (error) {
          console.error(
            `Error fetching events for order ${order.orderId}:`,
            error
          );
          return order;
        }
      })
    );

    // Calculate total locked amount from displayed orders
    // Only count OPEN and MATCHED (MAKER_LOCKED/TAKER_LOCKED) orders as locked
    // Note: This is an approximation. For accurate locked amount, use /api/p2p/locked-amount?chainId=X
    const totalLockedWei = orders.reduce((sum, order) => {
      if (
        order.status === "OPEN" ||
        order.status === "MAKER_LOCKED" ||
        order.status === "TAKER_LOCKED"
      ) {
        return sum + BigInt(order.sellAmount || "0");
      }
      return sum;
    }, BigInt(0));
    const totalLockedUSDT = Number(totalLockedWei) / 1e18;

    // For MATCHED/MAKER_LOCKED/TAKER_LOCKED orders, fetch remaining amount from contract
    // Also extract taker address and related transaction hashes from events
    const serializedOrders = await Promise.all(
      ordersWithEvents.map(async (order, index) => {
        let remainingAmount = order.sellAmount;
        let takerAddress: string | null = null;
        let isPartialTrade = false;
        const transactionHashes: Array<{
          eventName: string;
          txHash: string;
          chainId: number;
          createdAt: string;
        }> = [];

        // Use takerAddress from order if available (now stored directly in DB)
        // Handle case where column might not exist yet (migration not run)
        if (hasTakerAddressColumn) {
          takerAddress = (order as any).takerAddress || null;
        }

        // Extract transaction hashes from events
        // Also fix placeholder txHash from order
        let orderTxHash = order.txHash;
        const isPlaceholderTxHash =
          order.txHash ===
          "0x0000000000000000000000000000000000000000000000000000000000000000";

        if (order.events && order.events.length > 0) {
          // Sort events by creation time
          const sortedEvents = [...order.events].sort(
            (a: any, b: any) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          sortedEvents.forEach((event: any) => {
            // Skip events with placeholder txHash
            if (
              event.txHash &&
              event.txHash !==
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ) {
              // Add transaction hash
              transactionHashes.push({
                eventName: event.eventName,
                txHash: event.txHash,
                chainId: event.chainId,
                createdAt: event.createdAt,
              });

              // If order has placeholder txHash, use first event's txHash
              if (
                isPlaceholderTxHash &&
                event.eventName === "OrderCreated" &&
                !orderTxHash
              ) {
                orderTxHash = event.txHash;
              }
            }

            // If takerAddress not in order, try to extract from events (fallback)
            if (
              !takerAddress &&
              (event.eventName === "OrderMatched" ||
                event.eventName === "OrderCompleted")
            ) {
              const args = event.args as any;
              let seller: string | undefined;
              let buyer: string | undefined;

              if (Array.isArray(args)) {
                if (args.length >= 3) {
                  buyer = args[1];
                  seller = args[2];
                }
              } else if (typeof args === "object") {
                seller = args.seller || args.matchedSeller;
                buyer = args.buyer || args.matchedBuyer;
              }

              // For BSC orders: maker is buyer, taker is seller
              // For DSC orders: maker is seller, taker is buyer
              if (order.srcChainId === BSC_CHAIN_ID) {
                if (seller) {
                  takerAddress =
                    typeof seller === "string"
                      ? seller.toLowerCase()
                      : String(seller).toLowerCase();
                }
              } else {
                if (buyer) {
                  takerAddress =
                    typeof buyer === "string"
                      ? buyer.toLowerCase()
                      : String(buyer).toLowerCase();
                }
              }
            }
          });
        }

        // If still no transaction hashes, try to fetch from blockchain for ALL orders with placeholder
        // Process ALL orders but with small delay to avoid rate limiting
        if (transactionHashes.length === 0 && isPlaceholderTxHash) {
          // Add small delay for orders after first 5 to avoid rate limiting
          if (index > 5) {
            await new Promise((resolve) =>
              setTimeout(resolve, 100 * (index - 5))
            ); // 100ms delay per order
          }
          try {
            // Fetch OrderCreated event from blockchain
            const chainId = order.chainId;
            let client;
            let vaultAddress;
            let abi;

            if (chainId === BSC_CHAIN_ID) {
              client = createPublicClient({
                chain: bsc,
                transport: http(
                  process.env.NEXT_PUBLIC_CHAIN_A_RPC_URL ||
                    "https://bsc-dataseed1.binance.org"
                ),
              });
              vaultAddress = getContractAddress(BSC_CHAIN_ID, "vault");
              abi = P2PVaultBSCABI;
            } else if (chainId === DSC_CHAIN_ID) {
              client = createPublicClient({
                chain: dscChain,
                transport: http(
                  process.env.NEXT_PUBLIC_CHAIN_B_RPC_URL ||
                    "https://rpc01.dscscan.io/"
                ),
              });
              vaultAddress = getContractAddress(DSC_CHAIN_ID, "vault");
              abi = P2PVaultDSCABI;
            }

            if (client && vaultAddress && abi) {
              // Use order's blockNumber if available, otherwise search from contract deployment
              const currentBlock = await client.getBlockNumber();
              let fromBlock: bigint;
              let toBlock = currentBlock;

              // Get contract deployment block or use a reasonable start block
              const deploymentBlock = chainId === BSC_CHAIN_ID ? 76810700n : 0n; // BSC deployment block

              // Estimate block from order creation time (BSC: ~3s per block, DSC: similar)
              const orderAge = Date.now() - new Date(order.createdAt).getTime();
              const estimatedBlocksAgo = BigInt(Math.floor(orderAge / 3000)); // 3 seconds per block
              const estimatedBlock =
                currentBlock > estimatedBlocksAgo
                  ? currentBlock - estimatedBlocksAgo
                  : deploymentBlock;

              if (order.blockNumber && order.blockNumber > 0n) {
                // Search around the order's block number (±10k blocks)
                fromBlock =
                  order.blockNumber > 10000n
                    ? order.blockNumber - 10000n
                    : deploymentBlock;
                toBlock =
                  order.blockNumber + 10000n > currentBlock
                    ? currentBlock
                    : order.blockNumber + 10000n;
              } else if (
                estimatedBlock > deploymentBlock &&
                estimatedBlock < currentBlock
              ) {
                // Use estimated block with wider range (±20k blocks)
                fromBlock =
                  estimatedBlock > 20000n
                    ? estimatedBlock - 20000n
                    : deploymentBlock;
                toBlock =
                  estimatedBlock + 20000n > currentBlock
                    ? currentBlock
                    : estimatedBlock + 20000n;
              } else {
                // Fallback: search last 200k blocks
                fromBlock =
                  currentBlock > 200000n
                    ? currentBlock - 200000n
                    : deploymentBlock;
                toBlock = currentBlock;
              }

              try {
                // Try to fetch in smaller batches if range is too large
                const blockRange = toBlock - fromBlock;
                console.log(blockRange, "blockRange");
                let logs: any[] = [];

                if (blockRange > 100000n) {
                  // Split into smaller batches
                  const batchSize = 50000n;
                  let currentFrom = fromBlock;

                  while (currentFrom < toBlock && logs.length === 0) {
                    const currentTo =
                      currentFrom + batchSize > toBlock
                        ? toBlock
                        : currentFrom + batchSize;

                    try {
                      const batchLogs = await client.getLogs({
                        address: vaultAddress,
                        event: {
                          type: "event",
                          name: "OrderCreated",
                          inputs: [
                            { name: "orderId", type: "uint256", indexed: true },
                            { name: "buyer", type: "address", indexed: true },
                            { name: "amount", type: "uint256", indexed: false },
                            {
                              name: "expiresAt",
                              type: "uint256",
                              indexed: false,
                            },
                          ],
                        },
                        args: {
                          orderId: BigInt(order.orderId),
                        },
                        fromBlock: currentFrom,
                        toBlock: currentTo,
                      });

                      if (batchLogs && batchLogs.length > 0) {
                        logs = batchLogs;
                        break;
                      }
                    } catch (batchError: any) {
                      // If batch fails, try next batch
                      if (!batchError.message?.includes("too large")) {
                        break; // Stop if it's not a range error
                      }
                    }

                    currentFrom = currentTo + 1n;
                  }
                } else {
                  // Single query for smaller ranges
                  logs = await client.getLogs({
                    address: vaultAddress,
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
                    args: {
                      orderId: BigInt(order.orderId),
                    },
                    fromBlock,
                    toBlock,
                  });
                }

                if (logs && logs.length > 0) {
                  // Get the first matching log (should be OrderCreated)
                  const firstLog = logs[0];
                  const txHash = firstLog.transactionHash;

                  if (
                    txHash &&
                    txHash !==
                      "0x0000000000000000000000000000000000000000000000000000000000000000"
                  ) {
                    transactionHashes.push({
                      eventName: "OrderCreated",
                      txHash: txHash,
                      chainId: order.chainId,
                      createdAt: firstLog.blockNumber
                        ? new Date().toISOString()
                        : new Date().toISOString(),
                    });
                    orderTxHash = txHash;
                  }
                }
              } catch (blockchainError: any) {
                // Log error for debugging but don't fail the entire request
                if (process.env.NODE_ENV === "development") {
                  console.log(
                    `Could not fetch txHash from blockchain for order ${order.orderId}:`,
                    blockchainError.message
                  );
                }
              }
            }
          } catch (error) {
            // Silently fail
          }
        }

        // If order is MATCHED/MAKER_LOCKED/TAKER_LOCKED, fetch remaining from contract
        if (
          order.status === "MAKER_LOCKED" ||
          order.status === "TAKER_LOCKED"
        ) {
          try {
            const chainId = order.chainId;
            let client;
            let abi;
            let vaultAddress;

            if (chainId === BSC_CHAIN_ID) {
              client = createPublicClient({
                chain: bsc,
                transport: http(
                  process.env.NEXT_PUBLIC_CHAIN_A_RPC_URL ||
                    "https://bsc-dataseed1.binance.org"
                ),
              });
              abi = P2PVaultBSCABI;
              vaultAddress = getContractAddress(BSC_CHAIN_ID, "vault");
            } else if (chainId === DSC_CHAIN_ID) {
              client = createPublicClient({
                chain: dscChain,
                transport: http(
                  process.env.NEXT_PUBLIC_CHAIN_B_RPC_URL ||
                    "https://rpc01.dscscan.io/"
                ),
              });
              abi = P2PVaultDSCABI;
              vaultAddress = getContractAddress(DSC_CHAIN_ID, "vault");
            }

            if (client && abi && vaultAddress) {
              const orderData = (await client.readContract({
                address: vaultAddress,
                abi,
                functionName: "getOrder",
                args: [BigInt(order.orderId)],
              })) as any;

              // getOrder returns: [user, status, orderType, amount, filledAmount, expiresAt]
              const amount = orderData[3];
              const filledAmount = orderData[4] || 0n;
              const remaining = amount - filledAmount;
              remainingAmount = remaining.toString();

              // Check if partial trade
              if (filledAmount > 0n && remaining > 0n) {
                isPartialTrade = true;
              }
            }
          } catch (error) {
            console.error(
              `Error fetching remaining amount for order ${order.orderId}:`,
              error
            );
            // Fallback to sellAmount if contract read fails
          }
        }

        return {
          ...order,
          orderId: order.orderId.toString(),
          sellAmount: remainingAmount, // Use remaining amount for locked orders
          makerTimelock: order.makerTimelock.toString(),
          takerTimelock: order.takerTimelock.toString(),
          blockNumber: order.blockNumber.toString(),
          txHash:
            orderTxHash &&
            orderTxHash !==
              "0x0000000000000000000000000000000000000000000000000000000000000000"
              ? orderTxHash
              : order.txHash, // Use real txHash from events if found, otherwise use order.txHash
          takerAddress, // Taker address extracted from events
          isPartialTrade, // Whether this is a partial trade
          transactionHashes, // All transaction hashes for related events
          escrows: order.escrows?.map((escrow) => ({
            ...escrow,
            timelock: escrow.timelock.toString(),
            blockNumber: escrow.blockNumber.toString(),
          })),
          events: order.events?.map((event: any) => ({
            ...event,
            blockNumber: event.blockNumber?.toString(),
          })),
        };
      })
    );

    return NextResponse.json({
      orders: serializedOrders,
      total,
      limit,
      offset,
      hasMore: offset + orders.length < total,
      totalLocked: totalLockedUSDT.toString(), // Total locked in USDT for displayed orders
    });
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    console.error("Error stack:", error?.stack);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error?.message || "Unknown error",
        details:
          process.env.NODE_ENV === "development" ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// POST - Create new order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderId,
      chainId,
      maker,
      sellToken,
      sellAmount,
      buyToken,
      buyAmount,
      srcChainId,
      dstChainId,
      hashLock,
      makerTimelock,
      takerTimelock,
      txHash,
      blockNumber,
      logIndex,
    } = body;

    // Validate required fields
    if (
      !orderId ||
      !chainId ||
      !maker ||
      !sellToken ||
      !sellAmount ||
      !buyToken ||
      !buyAmount
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const order = await prisma.order.create({
      data: {
        orderId: BigInt(orderId),
        chainId,
        maker: maker.toLowerCase(),
        sellToken,
        sellAmount,
        buyToken,
        buyAmount,
        srcChainId,
        dstChainId,
        hashLock,
        makerTimelock: BigInt(makerTimelock),
        takerTimelock: BigInt(takerTimelock),
        txHash,
        blockNumber: BigInt(blockNumber),
        logIndex,
        status: "OPEN",
      },
    });

    // Update user stats
    await prisma.user.upsert({
      where: { address: maker.toLowerCase() },
      update: {
        ordersCreated: { increment: 1 },
      },
      create: {
        address: maker.toLowerCase(),
        ordersCreated: 1,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
