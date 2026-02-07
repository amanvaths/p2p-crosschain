// Debug database - check events and indexer state
import { prisma } from './src/lib/db';

async function debug() {
  try {
    console.log('🔍 Debugging Database...\n');
    
    // Check events
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    
    console.log(`📊 Events: ${events.length} total`);
    events.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.eventName} on chain ${e.chainId} - Processed: ${e.processed}`);
      console.log(`     Block: ${e.blockNumber}, TX: ${e.txHash.slice(0, 10)}...`);
      console.log(`     Args: ${JSON.stringify(e.args).slice(0, 100)}...`);
    });
    
    // Check indexer state
    const indexerStates = await prisma.indexerState.findMany();
    console.log(`\n📡 Indexer States: ${indexerStates.length}`);
    indexerStates.forEach(state => {
      console.log(`  Chain ${state.chainId}: Last block ${state.lastBlockNumber}`);
    });
    
    // Check orders
    const orders = await prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    console.log(`\n📦 Orders: ${orders.length} total`);
    orders.forEach((o, i) => {
      console.log(`  ${i + 1}. Order ID: ${o.orderId}, Chain: ${o.chainId}, Status: ${o.status}`);
      console.log(`     Maker: ${o.maker}, Amount: ${o.sellAmount}`);
    });
    
    // Check chain configs
    const chainConfigs = await prisma.chainConfig.findMany();
    console.log(`\n⚙️  Chain Configs: ${chainConfigs.length}`);
    chainConfigs.forEach(cc => {
      console.log(`  Chain ${cc.chainId} (${cc.name}): Last indexed block ${cc.lastIndexedBlock}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debug();

