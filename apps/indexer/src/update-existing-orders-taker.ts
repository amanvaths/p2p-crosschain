// Update existing orders with takerAddress from events
import 'dotenv/config';
import prisma from './db.js';
import { reconnectDatabase } from './connection-manager.js';

async function updateOrdersWithTaker() {
  await reconnectDatabase();
  
  console.log('🔍 Updating existing orders with taker addresses from events...\n');
  
  try {
    // Get all orders that don't have takerAddress
    const ordersWithoutTaker = await prisma.order.findMany({
      where: {
        takerAddress: null,
        status: { in: ['MAKER_LOCKED', 'TAKER_LOCKED', 'COMPLETED'] },
      },
      include: {
        events: {
          where: {
            eventName: { in: ['OrderMatched', 'OrderCompleted'] },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    
    console.log(`📦 Found ${ordersWithoutTaker.length} orders without taker address\n`);
    
    let updated = 0;
    let notFound = 0;
    
    for (const order of ordersWithoutTaker) {
      // Try to find taker from events
      let takerAddress: string | null = null;
      
      // Check linked events first
      if (order.events && order.events.length > 0) {
        for (const event of order.events) {
          const args = event.args as any;
          
          if (event.eventName === 'OrderMatched' || event.eventName === 'OrderCompleted') {
            // For BSC orders: maker is buyer, taker is seller
            // For DSC orders: maker is seller, taker is buyer
            if (order.srcChainId === 56) {
              // BSC order
              const seller = args?.seller || args?.matchedSeller;
              if (seller) {
                takerAddress = typeof seller === 'string' ? seller.toLowerCase() : String(seller).toLowerCase();
                break;
              }
            } else {
              // DSC order
              const buyer = args?.buyer || args?.matchedBuyer;
              if (buyer) {
                takerAddress = typeof buyer === 'string' ? buyer.toLowerCase() : String(buyer).toLowerCase();
                break;
              }
            }
          }
        }
      }
      
      // If not found in linked events, search in events table
      if (!takerAddress) {
        const orderIdStr = order.orderId.toString();
        const orderIdNum = Number(order.orderId);
        
        try {
          const events = await prisma.$queryRaw<any[]>`
            SELECT "eventName", args
            FROM events
            WHERE "chainId" = ${order.chainId}
              AND "eventName" IN ('OrderMatched', 'OrderCompleted')
              AND (
                args::text LIKE ${`%"orderId":${orderIdStr}%`}
                OR args::text LIKE ${`%"orderId":"${orderIdStr}"%`}
                OR args::text LIKE ${`%"bscOrderId":${orderIdStr}%`}
                OR args::text LIKE ${`%"bscOrderId":"${orderIdStr}"%`}
              )
            ORDER BY "createdAt" ASC
            LIMIT 5
          `;
          
          for (const event of events) {
            const args = event.args as any;
            const eventOrderId = args?.orderId || args?.bscOrderId || args?.dscOrderId;
            const eventOrderIdNum = typeof eventOrderId === 'string' ? parseInt(eventOrderId) : Number(eventOrderId);
            
            if (eventOrderIdNum === orderIdNum || eventOrderId === orderIdStr || eventOrderId === orderIdNum) {
              if (order.srcChainId === 56) {
                // BSC order
                const seller = args?.seller || args?.matchedSeller;
                if (seller) {
                  takerAddress = typeof seller === 'string' ? seller.toLowerCase() : String(seller).toLowerCase();
                  break;
                }
              } else {
                // DSC order
                const buyer = args?.buyer || args?.matchedBuyer;
                if (buyer) {
                  takerAddress = typeof buyer === 'string' ? buyer.toLowerCase() : String(buyer).toLowerCase();
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error searching events for order ${order.orderId}:`, error);
        }
      }
      
      if (takerAddress) {
        await prisma.order.update({
          where: { id: order.id },
          data: { takerAddress },
        });
        console.log(`  ✅ Updated order ${order.orderId}: taker = ${takerAddress.slice(0, 10)}...`);
        updated++;
      } else {
        console.log(`  ⚠️  Order ${order.orderId}: taker not found in events`);
        notFound++;
      }
    }
    
    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Not found: ${notFound}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateOrdersWithTaker();

