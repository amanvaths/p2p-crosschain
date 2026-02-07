// Fix Order 8 status - it's MATCHED on contract but COMPLETED in database
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { config } from './config.js';
import prisma from './db.js';
import { reconnectDatabase } from './connection-manager.js';
import { OrderStatus } from '@prisma/client';

const BSC_CHAIN_ID = 56;

async function fixOrder8Status() {
  await reconnectDatabase();
  
  const bscConfig = config.chains.find(c => c.chainId === BSC_CHAIN_ID);
  if (!bscConfig) {
    console.error('BSC config not found');
    return;
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(bscConfig.rpcUrl),
  });

  console.log('🔍 Checking Order 8 status on contract vs database...\n');
  
  try {
    // Get order 8 from contract
    const order8Contract = await client.readContract({
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
      args: [8n],
    });
    
    const [user, status, orderType, amount, filledAmount, expiresAt] = order8Contract;
    const statusMap: Record<number, string> = {
      0: 'NONE',
      1: 'OPEN',
      2: 'MATCHED',
      3: 'COMPLETED',
      4: 'CANCELLED',
      5: 'EXPIRED',
      6: 'REFUNDED',
    };
    
    const contractStatus = statusMap[Number(status)] || `UNKNOWN(${status})`;
    const remainingAmount = amount - filledAmount;
    const remainingUSDT = Number(remainingAmount) / 1e18;
    
    console.log(`📊 Contract Order 8:`);
    console.log(`   Status: ${contractStatus} (${status})`);
    console.log(`   Amount: ${Number(amount) / 1e18} USDT`);
    console.log(`   Filled: ${Number(filledAmount) / 1e18} USDT`);
    console.log(`   Remaining: ${remainingUSDT} USDT\n`);
    
    // Get order 8 from database
    const order8Db = await prisma.order.findUnique({
      where: { orderId: 8n },
    });
    
    if (!order8Db) {
      console.log('❌ Order 8 not found in database');
      return;
    }
    
    console.log(`📊 Database Order 8:`);
    console.log(`   Status: ${order8Db.status}`);
    console.log(`   Amount: ${Number(order8Db.sellAmount) / 1e18} USDT\n`);
    
    // If contract says MATCHED but database says COMPLETED, fix it
    if (contractStatus === 'MATCHED' && order8Db.status === 'COMPLETED' && remainingUSDT > 0) {
      console.log('⚠️  Status mismatch detected!');
      console.log(`   Contract: MATCHED (${remainingUSDT} USDT remaining)`);
      console.log(`   Database: COMPLETED`);
      console.log(`\n🔧 Updating database to MAKER_LOCKED...\n`);
      
      await prisma.order.update({
        where: { orderId: 8n },
        data: { status: OrderStatus.MAKER_LOCKED },
      });
      
      console.log('✅ Order 8 status updated to MAKER_LOCKED');
    } else if (contractStatus === 'MATCHED' && remainingUSDT > 0) {
      console.log('✅ Contract shows MATCHED with remaining funds');
      console.log(`   Database status: ${order8Db.status}`);
      if (order8Db.status !== 'MAKER_LOCKED' && order8Db.status !== 'TAKER_LOCKED') {
        console.log(`\n🔧 Updating database to MAKER_LOCKED...\n`);
        await prisma.order.update({
          where: { orderId: 8n },
          data: { status: OrderStatus.MAKER_LOCKED },
        });
        console.log('✅ Order 8 status updated to MAKER_LOCKED');
      }
    } else {
      console.log('✅ Statuses match or order is fully completed');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixOrder8Status();

