// =============================================================================
// P2P Exchange Indexer - Block Synchronization
// =============================================================================

import type { Address, Log } from 'viem';
import prisma from './db.js';
import { config, type ChainConfig } from './config.js';
import { 
  getOrCreateClient, 
  safeDbOperation, 
  safeRpcOperation 
} from './connection-manager.js';
import { processBscVaultEvent, processDscVaultEvent } from './processors/vault.js';

// Chain IDs
const BSC_CHAIN_ID = 56;
const DSC_CHAIN_ID = 1555;

// Track if sync is in progress
const syncInProgress = new Map<number, boolean>();

export async function syncChain(chainConfig: ChainConfig): Promise<void> {
  const { chainId, name, orderbookAddress, escrowAddress } = chainConfig;

  // Prevent concurrent syncs for the same chain
  if (syncInProgress.get(chainId)) {
    console.log(`Sync already in progress for ${name}`);
    return;
  }

  syncInProgress.set(chainId, true);

  try {
    // Get last indexed block from database (with retry)
    let indexerState = await safeDbOperation(async () => {
      return await prisma.indexerState.findUnique({
        where: { chainId },
      });
    }, `get indexer state for chain ${chainId}`);

    let fromBlock =
      indexerState?.lastBlockNumber ?? chainConfig.startBlock;

    // Get current block (minus confirmations for safety) with retry
    const currentBlock = await safeRpcOperation(
      chainConfig,
      async (client) => await client.getBlockNumber(),
      `get current block for ${chainConfig.name}`
    );
    const safeBlock = currentBlock - BigInt(chainConfig.confirmations);

    if (fromBlock >= safeBlock) {
      // Already caught up
      syncInProgress.set(chainId, false);
      return;
    }

    // Process in batches
    const maxBlocksPerQuery = BigInt(config.indexer.maxBlocksPerQuery);

    while (fromBlock < safeBlock) {
      const toBlock =
        fromBlock + maxBlocksPerQuery > safeBlock
          ? safeBlock
          : fromBlock + maxBlocksPerQuery;

      console.log(
        `${name}: Syncing blocks ${fromBlock} to ${toBlock} (current: ${currentBlock})`
      );

      // Fetch logs for vault contract with retry
      const vaultLogs = await safeRpcOperation(
        chainConfig,
        async (client) => await fetchContractLogs(client, orderbookAddress, fromBlock, toBlock),
        `fetch logs for ${chainConfig.name}`
      );

      console.log(
        `${name}: Found ${vaultLogs.length} vault logs in blocks ${fromBlock}-${toBlock}`
      );

      // Process vault events based on chain
      for (const log of vaultLogs) {
        if (chainId === BSC_CHAIN_ID) {
          await processBscVaultEvent(chainId, orderbookAddress, log);
        } else if (chainId === DSC_CHAIN_ID) {
          await processDscVaultEvent(chainId, orderbookAddress, log);
        }
      }

      // Update indexer state with retry
      const block = await safeRpcOperation(
        chainConfig,
        async (client) => await client.getBlock({ blockNumber: toBlock }),
        `get block ${toBlock} for ${chainConfig.name}`
      );

      await safeDbOperation(async () => {
        await prisma.indexerState.upsert({
          where: { chainId },
          create: {
            chainId,
            lastBlockNumber: toBlock,
            lastBlockHash: block.hash!,
          },
          update: {
            lastBlockNumber: toBlock,
            lastBlockHash: block.hash!,
          },
        });
      }, `update indexer state for chain ${chainId}`);

      fromBlock = toBlock + 1n;
    }

    console.log(`${name}: Sync complete at block ${safeBlock}`);
  } catch (error) {
    console.error(`Error syncing ${name}:`, error);
  } finally {
    syncInProgress.set(chainId, false);
  }
}

async function fetchContractLogs(
  client: any,
  address: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<Log[]> {
  try {
    const logs = await client.getLogs({
      address,
      fromBlock,
      toBlock,
    });

    return logs;
  } catch (error: any) {
    // If block range too large, split into smaller chunks
    if (error?.message?.includes('too large') || error?.code === -32062) {
      const midBlock = (fromBlock + toBlock) / 2n;
      console.log(`Block range too large, splitting: ${fromBlock}-${midBlock} and ${midBlock + 1n}-${toBlock}`);
      const [logs1, logs2] = await Promise.all([
        fetchContractLogs(client, address, fromBlock, midBlock),
        fetchContractLogs(client, address, midBlock + 1n, toBlock),
      ]);
      return [...logs1, ...logs2];
    }
    console.error(`Error fetching logs for ${address}:`, error);
    throw error; // Re-throw to let retry mechanism handle it
  }
}

// Handle chain reorgs by checking if stored block hashes match
export async function handleReorg(chainId: number): Promise<void> {
  const chainConfig = config.chains.find((c) => c.chainId === chainId);
  if (!chainConfig) return;

  try {
    const indexerState = await safeDbOperation(async () => {
      return await prisma.indexerState.findUnique({
        where: { chainId },
      });
    }, `get indexer state for reorg check`);

    if (!indexerState) return;

    const block = await safeRpcOperation(
      chainConfig,
      async (client) => await client.getBlock({
        blockNumber: indexerState.lastBlockNumber,
      }),
      `get block for reorg check`
    );

    if (block.hash !== indexerState.lastBlockHash) {
      console.warn(
        `Reorg detected on chain ${chainId} at block ${indexerState.lastBlockNumber}`
      );

      // Roll back to a safe point
      const rollbackBlocks = BigInt(config.indexer.reorgToleranceBlocks);
      const safeBlock = indexerState.lastBlockNumber - rollbackBlocks;

      // Mark events as removed
      await safeDbOperation(async () => {
        await prisma.event.updateMany({
          where: {
            chainId,
            blockNumber: { gt: safeBlock },
          },
          data: { removed: true },
        });
      }, `mark events as removed after reorg`);

      // Update indexer state
      const safeBlockData = await safeRpcOperation(
        chainConfig,
        async (client) => await client.getBlock({ blockNumber: safeBlock }),
        `get safe block after reorg`
      );

      await safeDbOperation(async () => {
        await prisma.indexerState.update({
          where: { chainId },
          data: {
            lastBlockNumber: safeBlock,
            lastBlockHash: safeBlockData.hash!,
          },
        });
      }, `update indexer state after reorg`);

      console.log(`Rolled back to block ${safeBlock}`);
    }
  } catch (error) {
    console.error(`Error checking for reorg on chain ${chainId}:`, error);
    // Don't throw - allow indexer to continue
  }
}

export default syncChain;

