// Check events for a specific order
import 'dotenv/config';
import prisma from './db.js';
import { reconnectDatabase } from './connection-manager.js';

const ORDER_ID = 8n;

async function checkEvents() {
  await reconnectDatabase();
  
  try {
    console.log(`🔍 Checking events for order ${ORDER_ID.toString()}...\n`);
    
    // Check all events for BSC chain
    const allBscEvents = await prisma.event.findMany({
      where: {
        chainId: 56,
        eventName: { in: ['OrderCreated', 'OrderMatched', 'OrderCompleted'] },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    
    console.log(`📊 Total BSC events found: ${allBscEvents.length}\n`);
    
    allBscEvents.forEach((event, i) => {
      console.log(`Event ${i + 1}:`);
      console.log(`  Name: ${event.eventName}`);
      console.log(`  TX: ${event.txHash}`);
      console.log(`  Args: ${JSON.stringify(event.args).slice(0, 100)}...`);
      console.log(`  OrderId in args: ${(event.args as any)?.orderId}`);
      console.log('');
    });
    
    // Try to find events for order 8
    const orderIdStr = ORDER_ID.toString();
    const orderIdNum = Number(ORDER_ID);
    
    console.log(`\n🔍 Searching for orderId: ${orderIdStr} or ${orderIdNum}...\n`);
    
    // Try different query methods
    const events1 = await prisma.$queryRaw<any[]>`
      SELECT "eventName", "txHash", args
      FROM events
      WHERE "chainId" = 56
        AND "eventName" = 'OrderCreated'
        AND args::text LIKE ${`%"orderId":${orderIdStr}%`}
      LIMIT 5
    `;
    
    console.log(`Query 1 (LIKE with number): ${events1.length} results`);
    events1.forEach(e => {
      console.log(`  TX: ${e.txHash}, Args: ${JSON.stringify(e.args).slice(0, 80)}`);
    });
    
    const events2 = await prisma.$queryRaw<any[]>`
      SELECT "eventName", "txHash", args
      FROM events
      WHERE "chainId" = 56
        AND "eventName" = 'OrderCreated'
        AND args::text LIKE ${`%"orderId":"${orderIdStr}"%`}
      LIMIT 5
    `;
    
    console.log(`\nQuery 2 (LIKE with string): ${events2.length} results`);
    events2.forEach(e => {
      console.log(`  TX: ${e.txHash}, Args: ${JSON.stringify(e.args).slice(0, 80)}`);
    });
    
    // Check if order exists
    const order = await prisma.order.findUnique({
      where: { orderId: ORDER_ID },
    });
    
    if (order) {
      console.log(`\n📦 Order found in database:`);
      console.log(`  ID: ${order.id}`);
      console.log(`  TX Hash: ${order.txHash}`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Created: ${order.createdAt}`);
      
      // Check linked events
      const linkedEvents = await prisma.event.findMany({
        where: { orderId: order.id },
      });
      
      console.log(`\n🔗 Linked events: ${linkedEvents.length}`);
      linkedEvents.forEach(e => {
        console.log(`  ${e.eventName}: ${e.txHash}`);
      });
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkEvents();

