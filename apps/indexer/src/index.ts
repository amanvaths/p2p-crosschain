// =============================================================================
// P2P Exchange Indexer - Main Entry Point
// =============================================================================

import { config } from './config.js';
import prisma from './db.js';
import { initializeChainClients } from './chains.js';
import { syncChain, handleReorg } from './sync.js';

console.log('🚀 Starting P2P Exchange Indexer...');

// Graceful shutdown
let isShuttingDown = false;

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...');
  isShuttingDown = true;
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  isShuttingDown = true;
});

async function main(): Promise<void> {
  // Initialize chain clients
  console.log('Initializing chain clients...');
  initializeChainClients();

  // Verify database connection
  console.log('Connecting to database...');
  await prisma.$connect();
  console.log('Database connected');

  // Initial sync for all chains
  console.log('Starting initial sync...');
  for (const chainConfig of config.chains) {
    if (isShuttingDown) break;
    await syncChain(chainConfig);
  }

  // Start polling loop
  console.log('Starting polling loop...');

  while (!isShuttingDown) {
    for (const chainConfig of config.chains) {
      if (isShuttingDown) break;

      try {
        // Check for reorgs first
        await handleReorg(chainConfig.chainId);

        // Sync new blocks
        await syncChain(chainConfig);
      } catch (error) {
        console.error(`Error processing ${chainConfig.name}:`, error);
      }
    }

    // Wait before next poll
    if (!isShuttingDown) {
      await sleep(config.chains[0]?.pollIntervalMs ?? 12000);
    }
  }

  // Cleanup
  console.log('Disconnecting from database...');
  await prisma.$disconnect();
  console.log('Indexer stopped');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

