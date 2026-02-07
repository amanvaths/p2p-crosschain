// Analyze all order statuses on contract to find locked amount
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { config } from './config.js';

const BSC_CHAIN_ID = 56;

async function analyzeOrderStatuses() {
  const bscConfig = config.chains.find(c => c.chainId === BSC_CHAIN_ID);
  if (!bscConfig) {
    console.error('BSC config not found');
    return;
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(bscConfig.rpcUrl),
  });

  console.log('🔍 Analyzing all order statuses on contract...\n');
  
  try {
    const orderCount = await client.readContract({
      address: bscConfig.orderbookAddress,
      abi: [
        {
          type: 'function',
          name: 'getOrderCount',
          inputs: [],
          outputs: [{ name: '', type: 'uint256' }],
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
      functionName: 'getOrderCount',
    }) as bigint;
    
    console.log(`📊 Total orders on contract: ${orderCount.toString()}\n`);
    
    const statusMap: Record<number, string> = {
      0: 'NONE',
      1: 'OPEN',
      2: 'MATCHED',
      3: 'COMPLETED',
      4: 'CANCELLED',
      5: 'EXPIRED',
      6: 'REFUNDED',
    };
    
    let totalLockedWei = BigInt(0);
    const ordersByStatus: Record<string, { count: number; totalWei: bigint }> = {};
    
    for (let orderId = 1n; orderId <= orderCount; orderId++) {
      try {
        const order = await client.readContract({
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
        
        const [user, status, orderType, amount, filledAmount, expiresAt] = order;
        const statusName = statusMap[Number(status)] || `UNKNOWN(${status})`;
        const remainingAmount = amount - filledAmount;
        
        if (!ordersByStatus[statusName]) {
          ordersByStatus[statusName] = { count: 0, totalWei: 0n };
        }
        ordersByStatus[statusName].count++;
        ordersByStatus[statusName].totalWei += remainingAmount;
        
        // Only count OPEN and MATCHED orders as locked (not completed/cancelled/expired)
        if (status === 1 || status === 2) {
          totalLockedWei += remainingAmount;
        }
        
        console.log(`  Order ${orderId}: Status=${statusName}, Amount=${Number(amount)/1e18} USDT, Filled=${Number(filledAmount)/1e18} USDT, Remaining=${Number(remainingAmount)/1e18} USDT`);
      } catch (error: any) {
        // Order might not exist, skip
        if (!error.message.includes('revert')) {
          console.error(`  Error reading order ${orderId}:`, error.message);
        }
      }
    }
    
    console.log(`\n📊 Summary by Status:`);
    Object.entries(ordersByStatus).forEach(([status, data]) => {
      const totalUSDT = Number(data.totalWei) / 1e18;
      console.log(`   ${status}: ${data.count} orders, ${totalUSDT.toFixed(2)} USDT`);
    });
    
    const totalLockedUSDT = Number(totalLockedWei) / 1e18;
    console.log(`\n💰 Total Locked (OPEN + MATCHED): ${totalLockedUSDT.toFixed(2)} USDT`);
    
    // Get contract totalLocked
    const contractTotalLocked = await client.readContract({
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
    
    const contractTotalUSDT = Number(contractTotalLocked) / 1e18;
    console.log(`📊 Contract totalLocked: ${contractTotalUSDT.toFixed(2)} USDT`);
    
    if (Math.abs(totalLockedUSDT - contractTotalUSDT) > 0.01) {
      console.log(`\n⚠️  Difference: ${(contractTotalUSDT - totalLockedUSDT).toFixed(2)} USDT`);
    } else {
      console.log(`\n✅ Amounts match!`);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

analyzeOrderStatuses();

