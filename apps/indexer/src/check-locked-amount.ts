// Check actual locked amount on contract vs database orders
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { config } from './config.js';
import prisma from './db.js';
import { reconnectDatabase } from './connection-manager.js';

const BSC_CHAIN_ID = 56;

async function checkLockedAmount() {
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

  console.log('🔍 Checking locked amount vs orders...\n');
  console.log(`Contract: ${bscConfig.orderbookAddress}\n`);
  
  try {
    // Get actual locked amount from contract
    const totalLocked = await client.readContract({
      address: bscConfig.orderbookAddress,
      abi: [
        {
          type: 'function',
          name: 'totalLocked',
          inputs: [],
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'totalLocked',
    }) as bigint;
    
    const totalLockedUSDT = Number(totalLocked) / 1e18;
    console.log(`📊 Contract totalLocked: ${totalLocked.toString()} wei = ${totalLockedUSDT} USDT\n`);
    
    // Get all OPEN orders from database
    const openOrders = await prisma.order.findMany({
      where: {
        chainId: BSC_CHAIN_ID,
        status: 'OPEN',
      },
      select: {
        orderId: true,
        sellAmount: true,
        maker: true,
      },
    });
    
    console.log(`📋 Database OPEN orders: ${openOrders.length}`);
    
    // Sum up all open order amounts
    let dbTotalWei = BigInt(0);
    openOrders.forEach(order => {
      const amount = BigInt(order.sellAmount || '0');
      dbTotalWei += amount;
      const amountUSDT = Number(amount) / 1e18;
      console.log(`  Order ${order.orderId}: ${amountUSDT} USDT (maker: ${order.maker.slice(0, 10)}...)`);
    });
    
    const dbTotalUSDT = Number(dbTotalWei) / 1e18;
    console.log(`\n📊 Database total (sum of OPEN orders): ${dbTotalWei.toString()} wei = ${dbTotalUSDT} USDT\n`);
    
    // Check all orders (not just OPEN)
    const allOrders = await prisma.order.findMany({
      where: {
        chainId: BSC_CHAIN_ID,
      },
      select: {
        orderId: true,
        sellAmount: true,
        status: true,
        maker: true,
      },
    });
    
    console.log(`📋 All orders in database: ${allOrders.length}`);
    const allOrdersByStatus = allOrders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`   Status breakdown:`, allOrdersByStatus);
    
    // Sum all orders (regardless of status)
    let allOrdersTotalWei = BigInt(0);
    allOrders.forEach(order => {
      allOrdersTotalWei += BigInt(order.sellAmount || '0');
    });
    const allOrdersTotalUSDT = Number(allOrdersTotalWei) / 1e18;
    console.log(`\n📊 Database total (ALL orders): ${allOrdersTotalWei.toString()} wei = ${allOrdersTotalUSDT} USDT\n`);
    
    // Compare
    console.log('🔍 Comparison:');
    console.log(`   Contract totalLocked: ${totalLockedUSDT.toFixed(2)} USDT`);
    console.log(`   Database OPEN orders sum: ${dbTotalUSDT.toFixed(2)} USDT`);
    console.log(`   Database ALL orders sum: ${allOrdersTotalUSDT.toFixed(2)} USDT`);
    console.log(`   Difference (Contract - DB OPEN): ${(totalLockedUSDT - dbTotalUSDT).toFixed(2)} USDT`);
    
    if (Math.abs(totalLockedUSDT - dbTotalUSDT) > 0.01) {
      console.log(`\n⚠️  MISMATCH DETECTED!`);
      console.log(`   Contract has ${totalLockedUSDT.toFixed(2)} USDT locked`);
      console.log(`   But database OPEN orders sum to ${dbTotalUSDT.toFixed(2)} USDT`);
      console.log(`   Difference: ${(totalLockedUSDT - dbTotalUSDT).toFixed(2)} USDT`);
    } else {
      console.log(`\n✅ Amounts match!`);
    }
    
    // Check if there are orders on contract that aren't in database
    console.log(`\n🔍 Checking for missing orders...`);
    const contractOrderCount = await client.readContract({
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
    
    console.log(`   Contract order count: ${contractOrderCount.toString()}`);
    console.log(`   Database order count: ${allOrders.length}`);
    
    if (Number(contractOrderCount) !== allOrders.length) {
      console.log(`\n⚠️  Order count mismatch!`);
      console.log(`   Some orders on contract are not in database`);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkLockedAmount();

