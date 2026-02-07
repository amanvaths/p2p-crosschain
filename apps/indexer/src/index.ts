// =============================================================================
// P2P Exchange Indexer - Main Entry Point
// =============================================================================

import 'dotenv/config';
import { config } from './config.js';
import prisma from './db.js';
import { 
  initializeClientsWithRetry,
  startHealthMonitoring,
  reconnectDatabase,
  safeDbOperation,
  cleanupConnections
} from './connection-manager.js';
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
  try {
    // Initialize chain clients with retry
    console.log('Initializing chain clients with retry...');
    await initializeClientsWithRetry(config.chains);
    console.log('✅ All chain clients initialized');

    // Verify database connection with retry
    console.log('Connecting to database...');
    await reconnectDatabase();
    console.log('✅ Database connected');

    // Start health monitoring
    console.log('Starting health monitoring...');
    startHealthMonitoring(config.chains);
    console.log('✅ Health monitoring started');

    // Initial sync for all chains
    console.log('Starting initial sync...');
    for (const chainConfig of config.chains) {
      if (isShuttingDown) break;
      try {
        await syncChain(chainConfig);
      } catch (error) {
        console.error(`Error in initial sync for ${chainConfig.name}:`, error);
        // Continue with other chains
      }
    }

    // Start polling loop
    console.log('✅ Starting polling loop...');

    while (!isShuttingDown) {
      for (const chainConfig of config.chains) {
        if (isShuttingDown) break;

        try {
          // Check for reorgs first
          await handleReorg(chainConfig.chainId);

          // Sync new blocks
          await syncChain(chainConfig);
        } catch (error: any) {
          console.error(`Error processing ${chainConfig.name}:`, error?.message || error);
          // Wait a bit before retrying this chain
          await sleep(5000);
        }
      }

      // Wait before next poll
      if (!isShuttingDown) {
        await sleep(config.chains[0]?.pollIntervalMs ?? 12000);
      }
    }
  } catch (error) {
    console.error('Fatal error in main loop:', error);
    // Try to recover
    console.log('Attempting to recover...');
    await sleep(10000);
    // Restart main (will be caught by outer catch)
    throw error;
  } finally {
    // Cleanup
    console.log('Cleaning up connections...');
    await cleanupConnections();
    console.log('Indexer stopped');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run with auto-restart on fatal errors
async function runWithRestart() {
  let restartCount = 0;
  const maxRestarts = 10;
  
  while (restartCount < maxRestarts && !isShuttingDown) {
    try {
      await main();
      // If main completes normally, exit
      break;
    } catch (error) {
      restartCount++;
      console.error(`Fatal error (restart ${restartCount}/${maxRestarts}):`, error);
      
      if (restartCount >= maxRestarts) {
        console.error('Max restarts reached, exiting...');
        process.exit(1);
      }
      
      // Wait before restarting (exponential backoff)
      const waitTime = Math.min(30000 * Math.pow(2, restartCount - 1), 300000);
      console.log(`Restarting in ${waitTime / 1000} seconds...`);
      await sleep(waitTime);
    }
  }
}

runWithRestart().catch((error) => {
  console.error('Unrecoverable error:', error);
  process.exit(1);
});

