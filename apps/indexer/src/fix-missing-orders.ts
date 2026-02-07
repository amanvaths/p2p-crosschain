// Fix missing orders - manually query blockchain for OrderCreated events
import 'dotenv/config';
import { createPublicClient, http, decodeEventLog } from 'viem';
import { bsc } from 'viem/chains';
import { P2PVaultBSCABI } from '@p2p/shared';
import prisma from './db.js';
import { config } from './config.js';
import { OrderStatus } from '@prisma/client';

const BSC_CHAIN_ID = 56;
const DSC_CHAIN_ID = 1555;

async function findMissingOrders() {
  const bscConfig = config.chains.find(c => c.chainId === BSC_CHAIN_ID);
  if (!bscConfig) {
    console.error('BSC config not found');
    return;
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(bscConfig.rpcUrl),
  });

  console.log('🔍 Searching for OrderCreated events...');
  console.log(`Contract: ${bscConfig.orderbookAddress}`);
  console.log(`Start block: ${bscConfig.startBlock}`);
  
  // Get current block
  const currentBlock = await client.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);
  
  // Search from a lower block (maybe orders were created before start block)
  const searchFromBlock = bscConfig.startBlock - BigInt(100000); // Go back 100k blocks
  const searchToBlock = currentBlock;
  const batchSize = BigInt(5000); // Query in batches of 5000 blocks
  
  console.log(`Searching blocks ${searchFromBlock} to ${searchToBlock}...`);
  
  let allLogs: any[] = [];
  let fromBlock = searchFromBlock;
  
  try {
    while (fromBlock < searchToBlock) {
      const toBlock = fromBlock + batchSize > searchToBlock ? searchToBlock : fromBlock + batchSize;
      console.log(`  Querying blocks ${fromBlock} to ${toBlock}...`);
      
      try {
        const logs = await client.getLogs({
          address: bscConfig.orderbookAddress,
          event: {
            type: 'event',
            name: 'OrderCreated',
            inputs: [
              { name: 'orderId', type: 'uint256', indexed: true },
              { name: 'buyer', type: 'address', indexed: true },
              { name: 'amount', type: 'uint256', indexed: false },
              { name: 'expiresAt', type: 'uint256', indexed: false },
            ],
          },
          fromBlock,
          toBlock,
        });
        
        allLogs.push(...logs);
        console.log(`    Found ${logs.length} events in this batch`);
      } catch (error: any) {
        console.error(`    Error in batch ${fromBlock}-${toBlock}:`, error.message);
        // Continue with next batch
      }
      
      fromBlock = toBlock + 1n;
    }
    
    const logs = allLogs;
    
    console.log(`\n✅ Found ${logs.length} OrderCreated events`);
    
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: P2PVaultBSCABI,
          data: log.data,
          topics: log.topics,
        });
        
        const args = decoded.args as {
          orderId: bigint;
          buyer: string;
          amount: bigint;
          expiresAt: bigint;
        };
        
        console.log(`\n  Order ID: ${args.orderId}`);
        console.log(`  Buyer: ${args.buyer}`);
        console.log(`  Amount: ${args.amount.toString()}`);
        console.log(`  Block: ${log.blockNumber}`);
        console.log(`  TX: ${log.transactionHash}`);
        
        // Check if order exists in database
        const existing = await prisma.order.findUnique({
          where: { orderId: args.orderId },
        });
        
        if (existing) {
          console.log(`  ✅ Already in database`);
        } else {
          console.log(`  ⚠️  MISSING from database - creating now...`);
          
          // Create the order
          const order = await prisma.order.create({
            data: {
              orderId: args.orderId,
              chainId: BSC_CHAIN_ID,
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
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex || 0,
            },
          });
          
          console.log(`  ✅ Created order ${order.id}`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing log:`, error);
      }
    }
    
    console.log(`\n✅ Done! Processed ${logs.length} events`);
  } catch (error) {
    console.error('Error fetching logs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findMissingOrders();

