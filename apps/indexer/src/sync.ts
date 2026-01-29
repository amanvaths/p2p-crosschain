// =============================================================================
// P2P Exchange Indexer - Block Synchronization
// =============================================================================

import type { Address, Log } from 'viem';
import prisma from './db.js';
import { config, type ChainConfig } from './config.js';
import { getChainClient } from './chains.js';
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
    const client = getChainClient(chainId);

    // Get last indexed block from database
    let indexerState = await prisma.indexerState.findUnique({
      where: { chainId },
    });

    let fromBlock =
      indexerState?.lastBlockNumber ?? chainConfig.startBlock;

    // Get current block (minus confirmations for safety)
    const currentBlock = await client.getBlockNumber();
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

      // Fetch logs for vault contract (orderbookAddress now points to vault)
      const vaultLogs = await fetchContractLogs(client, orderbookAddress, fromBlock, toBlock);

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

      // Update indexer state
      const block = await client.getBlock({ blockNumber: toBlock });

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
  client: ReturnType<typeof getChainClient>,
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
  } catch (error) {
    console.error(`Error fetching logs for ${address}:`, error);
    return [];
  }
}

// Handle chain reorgs by checking if stored block hashes match
export async function handleReorg(chainId: number): Promise<void> {
  const client = getChainClient(chainId);
  const chainConfig = config.chains.find((c) => c.chainId === chainId);

  if (!chainConfig) return;

  const indexerState = await prisma.indexerState.findUnique({
    where: { chainId },
  });

  if (!indexerState) return;

  try {
    const block = await client.getBlock({
      blockNumber: indexerState.lastBlockNumber,
    });

    if (block.hash !== indexerState.lastBlockHash) {
      console.warn(
        `Reorg detected on chain ${chainId} at block ${indexerState.lastBlockNumber}`
      );

      // Roll back to a safe point
      const rollbackBlocks = BigInt(config.indexer.reorgToleranceBlocks);
      const safeBlock = indexerState.lastBlockNumber - rollbackBlocks;

      // Mark events as removed
      await prisma.event.updateMany({
        where: {
          chainId,
          blockNumber: { gt: safeBlock },
        },
        data: { removed: true },
      });

      // Update indexer state
      const safeBlockData = await client.getBlock({ blockNumber: safeBlock });

      await prisma.indexerState.update({
        where: { chainId },
        data: {
          lastBlockNumber: safeBlock,
          lastBlockHash: safeBlockData.hash!,
        },
      });

      console.log(`Rolled back to block ${safeBlock}`);
    }
  } catch (error) {
    console.error(`Error checking for reorg on chain ${chainId}:`, error);
  }
}

export default syncChain;

