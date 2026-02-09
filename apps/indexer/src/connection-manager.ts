// =============================================================================
// P2P Exchange Indexer - Connection Manager
// Handles reconnections, retries, and health checks
// =============================================================================

import { createPublicClient, http, type PublicClient, type Chain } from "viem";
import { bsc, sepolia, baseSepolia } from "viem/chains";
import type { ChainConfig } from "./config.js";
import prisma from "./db.js";

// Custom DSC Chain definition
const dscChain: Chain = {
  id: 1555,
  name: "DSC Chain",
  nativeCurrency: {
    name: "DSC",
    symbol: "DSC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc01.dscscan.io/"],
    },
  },
  blockExplorers: {
    default: {
      name: "DSCScan",
      url: "https://dscscan.io",
    },
  },
};

const chainById: Record<number, Chain> = {
  56: bsc,
  1555: dscChain,
  11155111: sepolia,
  84532: baseSepolia,
};

// Connection state tracking
const connectionState = new Map<
  number,
  {
    client: PublicClient;
    lastHealthCheck: number;
    consecutiveFailures: number;
    isHealthy: boolean;
  }
>();

// Database connection state
let dbConnectionHealthy = true;
let dbConsecutiveFailures = 0;

// =============================================================================
// Retry with exponential backoff
// =============================================================================

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 1000,
  maxDelay: number = 60000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );

      console.warn(
        `Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

// =============================================================================
// Health Checks
// =============================================================================

export async function checkRpcHealth(chainId: number): Promise<boolean> {
  const state = connectionState.get(chainId);
  if (!state) return false;

  try {
    // Try to get latest block number (lightweight operation)
    await state.client.getBlockNumber();
    state.isHealthy = true;
    state.consecutiveFailures = 0;
    state.lastHealthCheck = Date.now();
    return true;
  } catch (error) {
    state.isHealthy = false;
    state.consecutiveFailures++;
    console.error(`RPC health check failed for chain ${chainId}:`, error);
    return false;
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnectionHealthy = true;
    dbConsecutiveFailures = 0;
    return true;
  } catch (error) {
    dbConnectionHealthy = false;
    dbConsecutiveFailures++;
    console.error("Database health check failed:", error);
    return false;
  }
}

// =============================================================================
// Reconnect RPC Client
// =============================================================================

export async function reconnectRpcClient(
  chainConfig: ChainConfig
): Promise<PublicClient> {
  const chain = chainById[chainConfig.chainId];

  if (!chain) {
    throw new Error(`Unsupported chain: ${chainConfig.chainId}`);
  }

  console.log(`Reconnecting RPC client for ${chainConfig.name}...`);

  const client = createPublicClient({
    chain,
    transport: http(chainConfig.rpcUrl, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    batch: {
      multicall: true,
    },
  });

  // Test connection
  await retryWithBackoff(
    async () => {
      await client.getBlockNumber();
    },
    3,
    2000
  );

  // Update connection state
  connectionState.set(chainConfig.chainId, {
    client,
    lastHealthCheck: Date.now(),
    consecutiveFailures: 0,
    isHealthy: true,
  });

  console.log(`✅ RPC client reconnected for ${chainConfig.name}`);
  return client;
}

// =============================================================================
// Reconnect Database
// =============================================================================

export async function reconnectDatabase(): Promise<void> {
  console.log("Reconnecting to database...");

  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore disconnect errors
  }

  await retryWithBackoff(
    async () => {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
    },
    5,
    2000,
    30000
  );

  dbConnectionHealthy = true;
  dbConsecutiveFailures = 0;
  console.log("✅ Database reconnected");
}

// =============================================================================
// Get or Create Client with Auto-Reconnect
// =============================================================================

export async function getOrCreateClient(
  chainConfig: ChainConfig
): Promise<PublicClient> {
  let state = connectionState.get(chainConfig.chainId);

  // Check if client exists and is healthy
  if (state && state.isHealthy) {
    // Periodic health check (every 5 minutes)
    const timeSinceLastCheck = Date.now() - state.lastHealthCheck;
    if (timeSinceLastCheck > 5 * 60 * 1000) {
      const isHealthy = await checkRpcHealth(chainConfig.chainId);
      if (!isHealthy) {
        // Reconnect if unhealthy
        return await reconnectRpcClient(chainConfig);
      }
    }
    return state.client;
  }

  // Reconnect if no client or unhealthy
  return await reconnectRpcClient(chainConfig);
}

// =============================================================================
// Initialize Clients with Retry
// =============================================================================

export async function initializeClientsWithRetry(
  chainConfigs: ChainConfig[]
): Promise<void> {
  for (const chainConfig of chainConfigs) {
    try {
      await retryWithBackoff(
        async () => {
          await reconnectRpcClient(chainConfig);
        },
        5,
        2000,
        30000
      );
    } catch (error) {
      console.error(
        `Failed to initialize client for ${chainConfig.name} after retries:`,
        error
      );
      throw error;
    }
  }
}

// =============================================================================
// Get Client (with auto-reconnect on failure)
// =============================================================================

export function getChainClient(chainId: number): PublicClient {
  const state = connectionState.get(chainId);
  if (!state) {
    throw new Error(`No client initialized for chain ${chainId}`);
  }
  return state.client;
}

// =============================================================================
// Periodic Health Monitoring
// =============================================================================

export function startHealthMonitoring(chainConfigs: ChainConfig[]): void {
  setInterval(async () => {
    // Check database health
    if (!(await checkDatabaseHealth())) {
      if (dbConsecutiveFailures >= 3) {
        console.warn("Database unhealthy, attempting reconnection...");
        try {
          await reconnectDatabase();
        } catch (error) {
          console.error("Failed to reconnect database:", error);
        }
      }
    }

    // Check RPC health for each chain
    for (const chainConfig of chainConfigs) {
      const state = connectionState.get(chainConfig.chainId);
      if (!state) continue;

      const isHealthy = await checkRpcHealth(chainConfig.chainId);
      if (!isHealthy && state.consecutiveFailures >= 3) {
        console.warn(
          `RPC unhealthy for ${chainConfig.name}, attempting reconnection...`
        );
        try {
          await reconnectRpcClient(chainConfig);
        } catch (error) {
          console.error(
            `Failed to reconnect RPC for ${chainConfig.name}:`,
            error
          );
        }
      }
    }
  }, 60000); // Check every minute
}

// =============================================================================
// Safe Database Operations with Retry
// =============================================================================

export async function safeDbOperation<T>(
  operation: () => Promise<T>,
  operationName: string = "database operation"
): Promise<T> {
  return await retryWithBackoff(
    async () => {
      // Check database health first
      if (!dbConnectionHealthy) {
        await reconnectDatabase();
      }

      try {
        return await operation();
      } catch (error: any) {
        // Check if it's a connection error
        if (
          error?.code === "P1001" ||
          error?.code === "P1002" ||
          error?.message?.includes("connection")
        ) {
          dbConnectionHealthy = false;
          await reconnectDatabase();
          // Retry once after reconnection
          return await operation();
        }
        throw error;
      }
    },
    3,
    1000,
    10000
  );
}

// =============================================================================
// Safe RPC Operations with Retry
// =============================================================================

export async function safeRpcOperation<T>(
  chainConfig: ChainConfig,
  operation: (client: PublicClient) => Promise<T>,
  operationName: string = "RPC operation"
): Promise<T> {
  return await retryWithBackoff(
    async () => {
      const client = await getOrCreateClient(chainConfig);

      try {
        return await operation(client);
      } catch (error: any) {
        // Check if it's a connection/RPC error
        if (
          error?.message?.includes("fetch") ||
          error?.message?.includes("network") ||
          error?.code === -32000 ||
          error?.code === -32603
        ) {
          const state = connectionState.get(chainConfig.chainId);
          if (state) {
            state.isHealthy = false;
            state.consecutiveFailures++;
          }
          // Reconnect and retry
          await reconnectRpcClient(chainConfig);
          return await operation(await getOrCreateClient(chainConfig));
        }
        throw error;
      }
    },
    3,
    2000,
    30000
  );
}

// =============================================================================
// Cleanup
// =============================================================================

export async function cleanupConnections(): Promise<void> {
  console.log("Cleaning up connections...");
  connectionState.clear();
  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore errors during cleanup
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  getChainClient,
  getOrCreateClient,
  initializeClientsWithRetry,
  startHealthMonitoring,
  safeDbOperation,
  safeRpcOperation,
  checkRpcHealth,
  checkDatabaseHealth,
  reconnectRpcClient,
  reconnectDatabase,
  cleanupConnections,
};
