// Sync ALL orders from contract to database (including completed/cancelled)
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { config } from './config.js';
import prisma from './db.js';
import { OrderStatus } from '@prisma/client';
import { safeDbOperation, reconnectDatabase } from './connection-manager.js';

const BSC_CHAIN_ID = 56;
const DSC_CHAIN_ID = 1555;

async function syncAllOrders() {
  // Connect to database first
  await reconnectDatabase();
  
  const bscConfig = config.chains.find(c => c.chainId === BSC_CHAIN_ID);
  if (!bscConfig) {
    console.error('BSC config not found');
    return;
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(bscConfig.rpcUrl, {
      retryCount: 3,
      retryDelay: 1000,
    }),
  });

  console.log('🔍 Syncing ALL orders from contract...');
  console.log(`Contract: ${bscConfig.orderbookAddress}\n`);
  
  try {
    // Try to get order count - if function exists
    let totalOrders = 0n;
    try {
      totalOrders = await client.readContract({
        address: bscConfig.orderbookAddress,
        abi: [
          {
            type: 'function',
            name: 'getOrderCount',
            inputs: [],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'getOrderCount',
      }) as bigint;
      console.log(`📊 Total orders on contract: ${totalOrders.toString()}\n`);
    } catch (error) {
      console.log('⚠️  getOrderCount not available, will try to query by order ID\n');
    }
    
    // If we have order count, try to sync all orders
    if (totalOrders > 0n) {
      let created = 0;
      let skipped = 0;
      let errors = 0;
      
      // Try to sync orders from ID 1 to totalOrders
      for (let orderId = 1n; orderId <= totalOrders; orderId++) {
        try {
          // Check if order exists in database
          const existing = await safeDbOperation(async () => {
            return await prisma.order.findUnique({
              where: { orderId },
            });
          }, `check existing order ${orderId}`);
          
          if (existing) {
            console.log(`  ⏭️  Order ${orderId} already exists`);
            skipped++;
            continue;
          }
          
          // Get order details from contract
          const orderDetails = await client.readContract({
            address: bscConfig.orderbookAddress,
            abi: [
              {
                type: 'function',
                name: 'getOrder',
                inputs: [{ name: 'orderId', type: 'uint256' }],
                outputs: [
                  { name: 'user', type: 'address' },
                  { name: 'status', type: 'uint8' },
                  { name: 'orderType', type: 'uint8' },
                  { name: 'amount', type: 'uint256' },
                  { name: 'filledAmount', type: 'uint256' },
                  { name: 'expiresAt', type: 'uint256' },
                ],
                stateMutability: 'view',
              },
            ],
            functionName: 'getOrder',
            args: [orderId],
          });
          
          const [buyerAddr, status, orderType, orderAmount, filledAmount, orderExpiresAt] = orderDetails;
          
          // Skip if status is NONE (0) - order doesn't exist
          if (status === 0) {
            continue;
          }
          
          // Map contract status to database status
          let dbStatus = OrderStatus.OPEN;
          if (status === 2) dbStatus = OrderStatus.COMPLETED;
          else if (status === 3) dbStatus = OrderStatus.CANCELLED;
          else if (status === 4) dbStatus = OrderStatus.EXPIRED;
          else if (status === 5) dbStatus = OrderStatus.REFUNDED;
          
          // Create order in database (with retry)
          const order = await safeDbOperation(async () => {
            return await prisma.order.create({
              data: {
                orderId,
                chainId: BSC_CHAIN_ID,
                maker: buyerAddr.toLowerCase(),
                sellToken: '0x55d398326f99059ff775485246999027b3197955', // BSC USDT
                sellAmount: orderAmount.toString(),
                buyToken: '0xbc27aceac6865de31a286cd9057564393d5251cb', // DSC USDT
                buyAmount: orderAmount.toString(),
                srcChainId: BSC_CHAIN_ID,
                dstChainId: DSC_CHAIN_ID,
                hashLock: '0x0000000000000000000000000000000000000000000000000000000000000000',
                makerTimelock: orderExpiresAt,
                takerTimelock: orderExpiresAt,
                status: dbStatus,
                cancelled: status === 3,
                txHash: '0x0000000000000000000000000000000000000000000000000000000000000000', // Unknown
                blockNumber: 0n, // Unknown
                logIndex: 0,
              },
            });
          }, `create order ${orderId}`);
          
          console.log(`  ✅ Created order ${order.id} (on-chain: ${orderId}, status: ${dbStatus})`);
          created++;
        } catch (error: any) {
          // Order might not exist (status 0), skip silently
          if (error?.message?.includes('revert') || error?.message?.includes('not found')) {
            continue;
          }
          console.error(`  ❌ Error processing order ${orderId}:`, error.message);
          errors++;
        }
      }
      
      console.log(`\n✅ Sync complete!`);
      console.log(`   Created: ${created}`);
      console.log(`   Skipped: ${skipped}`);
      console.log(`   Errors: ${errors}`);
    } else {
      console.log('⚠️  Could not determine order count, skipping sync');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

syncAllOrders();

