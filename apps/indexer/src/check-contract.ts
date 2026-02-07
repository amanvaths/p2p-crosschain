// Check contract directly for orders
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { config } from './config.js';

const BSC_CHAIN_ID = 56;

async function checkContract() {
  const bscConfig = config.chains.find(c => c.chainId === BSC_CHAIN_ID);
  if (!bscConfig) {
    console.error('BSC config not found');
    return;
  }

  const client = createPublicClient({
    chain: bsc,
    transport: http(bscConfig.rpcUrl),
  });

  console.log('🔍 Checking contract directly...');
  console.log(`Contract: ${bscConfig.orderbookAddress}`);
  
  try {
    // Try to read getOrderCount
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
      ],
      functionName: 'getOrderCount',
    });
    
    console.log(`\n✅ Contract is accessible`);
    console.log(`📊 Total orders on contract: ${orderCount.toString()}`);
    
    if (orderCount > 0n) {
      console.log(`\n⚠️  Contract has ${orderCount} orders but database has 0!`);
      console.log(`   This means the indexer is not catching them.`);
    } else {
      console.log(`\n✅ Contract has 0 orders - no orders exist yet.`);
    }
  } catch (error: any) {
    console.error('❌ Error reading contract:', error.message);
    console.error('   This might mean:');
    console.error('   1. Contract address is wrong');
    console.error('   2. Contract doesn\'t have getOrderCount function');
    console.error('   3. RPC is not working');
  }
}

checkContract();

