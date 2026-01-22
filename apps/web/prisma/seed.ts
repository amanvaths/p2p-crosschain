// =============================================================================
// P2P Exchange - Database Seed Script
// =============================================================================

import { PrismaClient, OrderStatus, EscrowStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Seed chain configurations
  const chainA = await prisma.chainConfig.upsert({
    where: { chainId: 11155111 },
    update: {},
    create: {
      chainId: 11155111,
      name: 'Sepolia',
      rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo',
      orderbookAddress: '0x0000000000000000000000000000000000000000',
      escrowAddress: '0x0000000000000000000000000000000000000000',
      blockExplorer: 'https://sepolia.etherscan.io',
      lastIndexedBlock: BigInt(0),
      isActive: true,
    },
  });

  const chainB = await prisma.chainConfig.upsert({
    where: { chainId: 84532 },
    update: {},
    create: {
      chainId: 84532,
      name: 'Base Sepolia',
      rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/demo',
      orderbookAddress: '0x0000000000000000000000000000000000000000',
      escrowAddress: '0x0000000000000000000000000000000000000000',
      blockExplorer: 'https://sepolia.basescan.org',
      lastIndexedBlock: BigInt(0),
      isActive: true,
    },
  });

  console.log('Created chain configs:', chainA.name, chainB.name);

  // Seed demo orders
  const demoOrders = [
    {
      orderId: BigInt(1),
      chainId: 11155111,
      maker: '0x1234567890123456789012345678901234567890',
      sellToken: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
      sellAmount: '1000000000', // 1000 USDC
      buyToken: '0x4200000000000000000000000000000000000006', // WETH
      buyAmount: '500000000000000000', // 0.5 WETH
      srcChainId: 11155111,
      dstChainId: 84532,
      hashLock: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      makerTimelock: BigInt(Math.floor(Date.now() / 1000) + 86400),
      takerTimelock: BigInt(Math.floor(Date.now() / 1000) + 43200),
      status: OrderStatus.OPEN,
      cancelled: false,
      txHash: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
      blockNumber: BigInt(1000000),
      logIndex: 0,
    },
    {
      orderId: BigInt(2),
      chainId: 11155111,
      maker: '0x2345678901234567890123456789012345678901',
      sellToken: '0x7b79995e5f793a07bc00c21412e50ecae098e7f9', // WETH
      sellAmount: '1000000000000000000', // 1 WETH
      buyToken: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', // USDC
      buyAmount: '2000000000', // 2000 USDC
      srcChainId: 11155111,
      dstChainId: 84532,
      hashLock: '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      makerTimelock: BigInt(Math.floor(Date.now() / 1000) + 86400),
      takerTimelock: BigInt(Math.floor(Date.now() / 1000) + 43200),
      status: OrderStatus.MAKER_LOCKED,
      cancelled: false,
      txHash: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
      blockNumber: BigInt(1000001),
      logIndex: 0,
    },
    {
      orderId: BigInt(3),
      chainId: 84532,
      maker: '0x3456789012345678901234567890123456789012',
      sellToken: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', // USDC on Base
      sellAmount: '500000000', // 500 USDC
      buyToken: '0x7b79995e5f793a07bc00c21412e50ecae098e7f9', // WETH on Sepolia
      buyAmount: '250000000000000000', // 0.25 WETH
      srcChainId: 84532,
      dstChainId: 11155111,
      hashLock: '0x1111111111111111111111111111111111111111111111111111111111111111',
      makerTimelock: BigInt(Math.floor(Date.now() / 1000) + 86400),
      takerTimelock: BigInt(Math.floor(Date.now() / 1000) + 43200),
      status: OrderStatus.TAKER_LOCKED,
      cancelled: false,
      txHash: '0xcccc000000000000000000000000000000000000000000000000000000000003',
      blockNumber: BigInt(500000),
      logIndex: 0,
    },
    {
      orderId: BigInt(4),
      chainId: 11155111,
      maker: '0x4567890123456789012345678901234567890123',
      sellToken: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
      sellAmount: '5000000000', // 5000 USDC
      buyToken: '0x4200000000000000000000000000000000000006',
      buyAmount: '2000000000000000000', // 2 WETH
      srcChainId: 11155111,
      dstChainId: 84532,
      hashLock: '0x2222222222222222222222222222222222222222222222222222222222222222',
      makerTimelock: BigInt(Math.floor(Date.now() / 1000) + 86400),
      takerTimelock: BigInt(Math.floor(Date.now() / 1000) + 43200),
      status: OrderStatus.COMPLETED,
      secret: '0x3333333333333333333333333333333333333333333333333333333333333333',
      cancelled: false,
      txHash: '0xdddd000000000000000000000000000000000000000000000000000000000004',
      blockNumber: BigInt(999999),
      logIndex: 0,
    },
  ];

  for (const orderData of demoOrders) {
    const existing = await prisma.order.findUnique({
      where: { orderId: orderData.orderId },
    });

    if (!existing) {
      await prisma.order.create({ data: orderData });
      console.log(`Created demo order ${orderData.orderId}`);
    }
  }

  // Seed demo escrows for locked orders
  const order2 = await prisma.order.findUnique({
    where: { orderId: BigInt(2) },
  });

  if (order2) {
    const escrowExists = await prisma.escrow.findFirst({
      where: { orderId: order2.id },
    });

    if (!escrowExists) {
      await prisma.escrow.create({
        data: {
          orderId: order2.id,
          lockId: '0xaaaa111111111111111111111111111111111111111111111111111111111111',
          chainId: 11155111,
          depositor: order2.maker,
          recipient: '0x5678901234567890123456789012345678901234',
          token: order2.sellToken,
          amount: order2.sellAmount,
          hashLock: order2.hashLock,
          timelock: order2.makerTimelock,
          status: EscrowStatus.LOCKED,
          txHash: '0xeeee000000000000000000000000000000000000000000000000000000000001',
          blockNumber: BigInt(1000002),
          logIndex: 0,
        },
      });
      console.log('Created escrow for order 2');
    }
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

