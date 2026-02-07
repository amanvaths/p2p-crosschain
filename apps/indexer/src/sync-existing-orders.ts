// Sync existing orders from contract to database
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { config } from './config.js';
import prisma from './db.js';
import { OrderStatus } from '@prisma/client';
import { P2PVaultBSCABI } from '@p2p/shared';
import { safeDbOperation, reconnectDatabase } from './connection-manager.js';

const BSC_CHAIN_ID = 56;
const DSC_CHAIN_ID = 1555;

async function syncExistingOrders() {
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

  console.log('🔍 Syncing existing orders from contract...');
  console.log(`Contract: ${bscConfig.orderbookAddress}\n`);
  
  try {
    // Get open orders (limit to 100 for now)
    const openOrders = await client.readContract({
      address: bscConfig.orderbookAddress,
      abi: [
        {
          type: 'function',
          name: 'getOpenOrders',
          inputs: [
            { name: 'offset', type: 'uint256' },
            { name: 'limit', type: 'uint256' },
          ],
          outputs: [
            { name: 'orderIds', type: 'uint256[]' },
            { name: 'users', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' },
            { name: 'remainingAmounts', type: 'uint256[]' },
            { name: 'expiresAts', type: 'uint256[]' },
          ],
          stateMutability: 'view',
        },
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
      functionName: 'getOpenOrders',
      args: [0n, 100n],
    });
    
    const [orderIds, users, amounts, remainingAmounts, expiresAts] = openOrders;
    
    console.log(`📋 Found ${orderIds.length} open orders\n`);
    
    let created = 0;
    let skipped = 0;
    
    for (let i = 0; i < orderIds.length; i++) {
      const orderId = orderIds[i];
      const buyer = users[i];
      const amount = amounts[i];
      const expiresAt = expiresAts[i];
      
      // Check if order exists (with retry)
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
      
      // Get order details to check status
      try {
        const orderDetails = await client.readContract({
          address: bscConfig.orderbookAddress,
          abi: P2PVaultBSCABI,
          functionName: 'getOrder',
          args: [orderId],
        });
        
        const [buyerAddr, status, orderType, orderAmount, filledAmount, orderExpiresAt] = orderDetails;
        
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
        console.error(`  ❌ Error processing order ${orderId}:`, error.message);
      }
    }
    
    console.log(`\n✅ Sync complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

syncExistingOrders();

