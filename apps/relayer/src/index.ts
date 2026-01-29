// =============================================================================
// P2P Exchange Relayer V2 - Automated Order Matching & Execution
// =============================================================================

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load .env from root
dotenvConfig({ path: resolve(process.cwd(), '../../.env') });
dotenvConfig({ path: resolve(process.cwd(), '.env') });

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hash,
  formatUnits,
  getAddress,
  toHex,
  keccak256,
  encodePacked,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

// =============================================================================
// Configuration
// =============================================================================

const normalizeAddress = (addr: string): Address => {
  try {
    return getAddress(addr);
  } catch {
    return addr as Address;
  }
};

const config = {
  bsc: {
    chainId: 56,
    rpcUrl: process.env.NEXT_PUBLIC_CHAIN_A_RPC_URL || 'https://bsc-dataseed1.binance.org',
    vaultAddress: normalizeAddress(process.env.NEXT_PUBLIC_CHAIN_A_VAULT_CONTRACT || '0x2d66cd7d401b840f5e5b9f4a75794359126fe250'),
    usdtAddress: normalizeAddress(process.env.NEXT_PUBLIC_CHAIN_A_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955'),
  },
  dsc: {
    chainId: 1555,
    rpcUrl: process.env.NEXT_PUBLIC_CHAIN_B_RPC_URL || 'https://rpc01.dscscan.io/',
    vaultAddress: normalizeAddress(process.env.NEXT_PUBLIC_CHAIN_B_VAULT_CONTRACT || '0xdd8bbebc2b41e09ee5196c7e8436e625e4788b2d'),
    usdtAddress: normalizeAddress(process.env.NEXT_PUBLIC_CHAIN_B_USDT_CONTRACT || '0xbc27aCEac6865dE31a286Cd9057564393D5251CB'),
  },
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY as `0x${string}`,
  orderPollIntervalMs: Number(process.env.RELAYER_ORDER_POLL_MS || '5000'), // 5 seconds
};

// =============================================================================
// V2 ABIs
// =============================================================================

const BSC_VAULT_V2_ABI = parseAbi([
  // Read functions
  'function getOpenOrders(uint256 offset, uint256 limit) view returns (uint256[] orderIds, address[] users, uint256[] amounts, uint256[] remainingAmounts, uint256[] expiresAts)',
  'function getOrder(uint256 orderId) view returns (address user, uint8 status, uint8 orderType, uint256 amount, uint256 filledAmount, uint256 expiresAt)',
  'function getOrderCount() view returns (uint256)',
  'function isDscOrderUsed(uint256 bscOrderId, uint256 dscOrderId) view returns (bool)',
  // Write functions (relayer)
  'function fillAndRelease(uint256 bscOrderId, uint256 dscOrderId, address seller, uint256 amount, bytes32 dscTxHash)',
]);

const DSC_VAULT_V2_ABI = parseAbi([
  // Read functions
  'function getOpenSellOrders(uint256 offset, uint256 limit) view returns (uint256[] orderIds, address[] users, uint256[] amounts, uint256[] remainingAmounts, uint256[] expiresAts)',
  'function getPendingFillOrders(uint256 offset, uint256 limit) view returns (uint256[] orderIds, address[] sellers, address[] buyers, uint256[] amounts, uint256[] bscOrderIds)',
  'function getOrder(uint256 orderId) view returns (address user, uint8 status, uint8 orderType, uint256 amount, uint256 filledAmount, uint256 expiresAt)',
  'function getOrderCount() view returns (uint256)',
  'function getDscOrderForBscOrder(uint256 bscOrderId) view returns (uint256)',
  // Write functions (relayer)
  'function completeFillOrder(uint256 dscOrderId, bytes32 bscTxHash)',
  'function fillAndRelease(uint256 dscOrderId, uint256 bscOrderId, address buyer, uint256 amount, bytes32 bscTxHash)',
]);

// Order status enum (V2)
enum OrderStatusV2 {
  NONE = 0,
  OPEN = 1,
  PARTIALLY_FILLED = 2,
  COMPLETED = 3,
  CANCELLED = 4,
}

// =============================================================================
// DSC Chain definition
// =============================================================================

const dscChain = {
  id: 1555,
  name: 'DSC Chain',
  network: 'dsc',
  nativeCurrency: { name: 'DSC', symbol: 'DSC', decimals: 18 },
  rpcUrls: {
    default: { http: [config.dsc.rpcUrl] },
    public: { http: [config.dsc.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'DSCScan', url: 'https://dscscan.io' },
  },
} as const;

// =============================================================================
// Setup Clients
// =============================================================================

const account = privateKeyToAccount(config.relayerPrivateKey);

const bscPublicClient = createPublicClient({
  chain: bsc,
  transport: http(config.bsc.rpcUrl),
});

const bscWalletClient = createWalletClient({
  account,
  chain: bsc,
  transport: http(config.bsc.rpcUrl),
});

const dscPublicClient = createPublicClient({
  chain: dscChain,
  transport: http(config.dsc.rpcUrl),
});

const dscWalletClient = createWalletClient({
  account,
  chain: dscChain,
  transport: http(config.dsc.rpcUrl),
});

// =============================================================================
// Types
// =============================================================================

interface PendingFillOrder {
  dscOrderId: bigint;
  bscOrderId: bigint;
  seller: Address;
  buyer: Address;
  amount: bigint;
}

interface OpenBuyOrder {
  orderId: bigint;
  user: Address;
  amount: bigint;
  remainingAmount: bigint;
  expiresAt: bigint;
}

interface OpenSellOrder {
  orderId: bigint;
  user: Address;
  amount: bigint;
  remainingAmount: bigint;
  expiresAt: bigint;
}

// =============================================================================
// Main Relayer Logic
// =============================================================================

async function getPendingFillOrders(): Promise<PendingFillOrder[]> {
  try {
    const [orderIds, sellers, buyers, amounts, bscOrderIds] = await dscPublicClient.readContract({
      address: config.dsc.vaultAddress,
      abi: DSC_VAULT_V2_ABI,
      functionName: 'getPendingFillOrders',
      args: [0n, 100n],
    });
    
    const orders: PendingFillOrder[] = [];
    for (let i = 0; i < orderIds.length; i++) {
      orders.push({
        dscOrderId: orderIds[i],
        bscOrderId: bscOrderIds[i],
        seller: sellers[i],
        buyer: buyers[i],
        amount: amounts[i],
      });
    }
    return orders;
  } catch (error) {
    console.error('Failed to get pending fill orders:', error);
    return [];
  }
}

async function getOpenBuyOrders(): Promise<OpenBuyOrder[]> {
  try {
    const [orderIds, users, amounts, remainingAmounts, expiresAts] = await bscPublicClient.readContract({
      address: config.bsc.vaultAddress,
      abi: BSC_VAULT_V2_ABI,
      functionName: 'getOpenOrders',
      args: [0n, 100n],
    });
    
    const orders: OpenBuyOrder[] = [];
    for (let i = 0; i < orderIds.length; i++) {
      orders.push({
        orderId: orderIds[i],
        user: users[i],
        amount: amounts[i],
        remainingAmount: remainingAmounts[i],
        expiresAt: expiresAts[i],
      });
    }
    return orders;
  } catch (error) {
    console.error('Failed to get open buy orders:', error);
    return [];
  }
}

async function getOpenSellOrders(): Promise<OpenSellOrder[]> {
  try {
    const [orderIds, users, amounts, remainingAmounts, expiresAts] = await dscPublicClient.readContract({
      address: config.dsc.vaultAddress,
      abi: DSC_VAULT_V2_ABI,
      functionName: 'getOpenSellOrders',
      args: [0n, 100n],
    });
    
    const orders: OpenSellOrder[] = [];
    for (let i = 0; i < orderIds.length; i++) {
      orders.push({
        orderId: orderIds[i],
        user: users[i],
        amount: amounts[i],
        remainingAmount: remainingAmounts[i],
        expiresAt: expiresAts[i],
      });
    }
    return orders;
  } catch (error) {
    console.error('Failed to get open sell orders:', error);
    return [];
  }
}

async function executeFillOrder(pendingOrder: PendingFillOrder): Promise<boolean> {
  const { dscOrderId, bscOrderId, seller, buyer, amount } = pendingOrder;
  
  console.log(`\n🎯 EXECUTING FILL ORDER`);
  console.log(`   DSC Order #${dscOrderId} → BSC Order #${bscOrderId}`);
  console.log(`   Amount: ${formatUnits(amount, 18)} USDT`);
  console.log(`   Seller: ${seller}`);
  console.log(`   Buyer: ${buyer}`);
  
  try {
    // Step 1: Check if already processed on BSC
    const alreadyUsed = await bscPublicClient.readContract({
      address: config.bsc.vaultAddress,
      abi: BSC_VAULT_V2_ABI,
      functionName: 'isDscOrderUsed',
      args: [bscOrderId, dscOrderId],
    });
    
    if (alreadyUsed) {
      console.log(`   ⚠️  Already processed, skipping BSC release`);
    } else {
      // Generate a proof hash from DSC order ID
      const dscTxHash = keccak256(encodePacked(['uint256', 'uint256', 'address'], [dscOrderId, bscOrderId, seller]));
      
      // Step 2: Call fillAndRelease on BSC
      console.log(`   📤 Releasing BEP20 on BSC...`);
      const bscTxHash = await bscWalletClient.writeContract({
        address: config.bsc.vaultAddress,
        abi: BSC_VAULT_V2_ABI,
        functionName: 'fillAndRelease',
        args: [bscOrderId, dscOrderId, seller, amount, dscTxHash],
      });
      
      console.log(`   ⏳ BSC TX: ${bscTxHash}`);
      
      // Wait for BSC confirmation
      const bscReceipt = await bscPublicClient.waitForTransactionReceipt({ hash: bscTxHash });
      
      if (bscReceipt.status !== 'success') {
        console.log(`   ❌ BSC TX failed`);
        return false;
      }
      
      console.log(`   ✅ BSC TX confirmed, BEP20 released to seller`);
    }
    
    // Step 3: Complete the fill order on DSC to release DEP20 to buyer
    console.log(`   📤 Releasing DEP20 on DSC...`);
    
    // Use BSC tx hash as proof (or generate one)
    const bscProofHash = keccak256(encodePacked(['uint256', 'uint256', 'address'], [bscOrderId, dscOrderId, buyer]));
    
    const dscTxHash = await dscWalletClient.writeContract({
      address: config.dsc.vaultAddress,
      abi: DSC_VAULT_V2_ABI,
      functionName: 'completeFillOrder',
      args: [dscOrderId, bscProofHash],
    });
    
    console.log(`   ⏳ DSC TX: ${dscTxHash}`);
    
    // Wait for DSC confirmation
    const dscReceipt = await dscPublicClient.waitForTransactionReceipt({ hash: dscTxHash, timeout: 60000 });
    
    if (dscReceipt.status !== 'success') {
      console.log(`   ❌ DSC TX failed`);
      return false;
    }
    
    console.log(`   ✅ DSC TX confirmed, DEP20 released to buyer`);
    console.log(`   🎉 TRADE COMPLETE!`);
    
    return true;
  } catch (error: any) {
    console.error(`   ❌ Error:`, error.message || error);
    return false;
  }
}

// Track matched orders to avoid duplicate matches
const matchedPairs = new Set<string>();

async function matchAndExecuteOrders(
  buyOrders: OpenBuyOrder[],
  sellOrders: OpenSellOrder[]
): Promise<void> {
  console.log(`\n🔄 AUTO-MATCHING ORDERS...`);
  
  for (const buyOrder of buyOrders) {
    for (const sellOrder of sellOrders) {
      // Create unique key for this pair
      const pairKey = `${buyOrder.orderId}-${sellOrder.orderId}`;
      
      // Skip if already matched
      if (matchedPairs.has(pairKey)) {
        continue;
      }
      
      // Match orders with compatible amounts
      const matchAmount = buyOrder.remainingAmount < sellOrder.remainingAmount 
        ? buyOrder.remainingAmount 
        : sellOrder.remainingAmount;
      
      if (matchAmount === 0n) continue;
      
      console.log(`\n🎯 MATCHING: BSC #${buyOrder.orderId} ↔ DSC #${sellOrder.orderId}`);
      console.log(`   BSC Buyer: ${buyOrder.user} wants ${formatUnits(buyOrder.remainingAmount, 18)} DEP20`);
      console.log(`   DSC Seller: ${sellOrder.user} selling ${formatUnits(sellOrder.remainingAmount, 18)} DEP20`);
      console.log(`   Match Amount: ${formatUnits(matchAmount, 18)} USDT`);
      
      try {
        // Step 1: Release BEP20 on BSC to DSC seller
        console.log(`   📤 [BSC] Releasing BEP20 to seller...`);
        
        const dscProofHash = keccak256(encodePacked(
          ['uint256', 'uint256', 'address'], 
          [sellOrder.orderId, buyOrder.orderId, sellOrder.user]
        ));
        
        const bscTxHash = await bscWalletClient.writeContract({
          address: config.bsc.vaultAddress,
          abi: BSC_VAULT_V2_ABI,
          functionName: 'fillAndRelease',
          args: [buyOrder.orderId, sellOrder.orderId, sellOrder.user, matchAmount, dscProofHash],
        });
        
        console.log(`   ⏳ BSC TX: ${bscTxHash}`);
        
        const bscReceipt = await bscPublicClient.waitForTransactionReceipt({ hash: bscTxHash });
        
        if (bscReceipt.status !== 'success') {
          console.log(`   ❌ BSC TX failed!`);
          continue;
        }
        
        console.log(`   ✅ BSC: BEP20 released to ${sellOrder.user}`);
        
        // Step 2: Release DEP20 on DSC to BSC buyer
        console.log(`   📤 [DSC] Releasing DEP20 to buyer...`);
        
        const bscProofHash = keccak256(encodePacked(
          ['uint256', 'uint256', 'address'], 
          [buyOrder.orderId, sellOrder.orderId, buyOrder.user]
        ));
        
        const dscTxHash = await dscWalletClient.writeContract({
          address: config.dsc.vaultAddress,
          abi: DSC_VAULT_V2_ABI,
          functionName: 'fillAndRelease',
          args: [sellOrder.orderId, buyOrder.orderId, buyOrder.user, matchAmount, bscProofHash],
        });
        
        console.log(`   ⏳ DSC TX: ${dscTxHash}`);
        
        const dscReceipt = await dscPublicClient.waitForTransactionReceipt({ hash: dscTxHash, timeout: 60000 });
        
        if (dscReceipt.status !== 'success') {
          console.log(`   ❌ DSC TX failed! BEP20 released but DEP20 stuck!`);
          continue;
        }
        
        console.log(`   ✅ DSC: DEP20 released to ${buyOrder.user}`);
        console.log(`   🎉 SWAP COMPLETE! ${formatUnits(matchAmount, 18)} USDT swapped`);
        
        // Mark as matched
        matchedPairs.add(pairKey);
        
        // Only match one order per cycle to avoid race conditions
        return;
        
      } catch (error: any) {
        console.error(`   ❌ Match Error:`, error.message || error);
      }
    }
  }
  
  console.log(`   💤 No matchable orders found`);
}

async function scanAndExecute() {
  const now = new Date().toLocaleTimeString();
  console.log(`\n⏰ [${now}] Scanning orders...`);
  
  // Get all order types
  const pendingFills = await getPendingFillOrders();
  const openBuyOrders = await getOpenBuyOrders();
  const openSellOrders = await getOpenSellOrders();
  
  console.log(`\n📊 ORDER STATUS`);
  console.log(`   BSC Buy Orders: ${openBuyOrders.length}`);
  for (const order of openBuyOrders) {
    console.log(`     #${order.orderId}: ${formatUnits(order.remainingAmount, 18)}/${formatUnits(order.amount, 18)} USDT by ${order.user.slice(0,8)}...`);
  }
  
  console.log(`   DSC Sell Orders: ${openSellOrders.length}`);
  for (const order of openSellOrders) {
    console.log(`     #${order.orderId}: ${formatUnits(order.remainingAmount, 18)}/${formatUnits(order.amount, 18)} USDT by ${order.user.slice(0,8)}...`);
  }
  
  console.log(`   DSC Pending Fills: ${pendingFills.length}`);
  for (const order of pendingFills) {
    console.log(`     #${order.dscOrderId} → BSC #${order.bscOrderId}: ${formatUnits(order.amount, 18)} USDT`);
  }
  
  // Priority 1: Execute pending fills (already linked orders)
  if (pendingFills.length > 0) {
    console.log(`\n🚀 EXECUTING ${pendingFills.length} PENDING FILL(S)...`);
    
    for (const pendingFill of pendingFills) {
      const success = await executeFillOrder(pendingFill);
      if (!success) {
        console.log(`   ⚠️  Will retry next cycle`);
      }
    }
  }
  
  // Priority 2: Auto-match open BSC buy orders with DSC sell orders
  if (openBuyOrders.length > 0 && openSellOrders.length > 0) {
    await matchAndExecuteOrders(openBuyOrders, openSellOrders);
  } else if (openBuyOrders.length > 0) {
    console.log(`\n💤 ${openBuyOrders.length} BSC buyer(s) waiting for DSC sellers`);
  } else if (openSellOrders.length > 0) {
    console.log(`\n💤 ${openSellOrders.length} DSC seller(s) waiting for BSC buyers`);
  } else {
    console.log(`\n💤 No orders to match`);
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           P2P Exchange Relayer V2 - Auto Execution            ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`BSC Vault:     ${config.bsc.vaultAddress}`);
  console.log(`DSC Vault:     ${config.dsc.vaultAddress}`);
  console.log(`Poll Interval: ${config.orderPollIntervalMs / 1000}s`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (!config.relayerPrivateKey) {
    console.error('❌ RELAYER_PRIVATE_KEY not set');
    process.exit(1);
  }
  
  console.log(`✅ Relayer wallet: ${account.address}`);
  
  // Check balances
  const bscBalance = await bscPublicClient.getBalance({ address: account.address });
  const dscBalance = await dscPublicClient.getBalance({ address: account.address });
  
  console.log(`\n💰 Relayer Balances:`);
  console.log(`   BSC: ${formatUnits(bscBalance, 18)} BNB`);
  console.log(`   DSC: ${formatUnits(dscBalance, 18)} DSC`);
  
  // Initial scan
  await scanAndExecute();
  
  // Start polling
  setInterval(async () => {
    try {
      await scanAndExecute();
    } catch (error) {
      console.error('Scan error:', error);
    }
  }, config.orderPollIntervalMs);
}

main().catch(console.error);
