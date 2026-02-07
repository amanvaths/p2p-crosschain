// Test database connection
import { prisma } from './src/lib/db';

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...\n');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Database connection successful!\n');
    
    // Test query
    const result = await prisma.$queryRaw<Array<{ version: string; database: string; user: string }>>`
      SELECT version() as version, current_database() as database, current_user as user
    `;
    console.log('📊 Database Info:');
    console.log(`   Version: ${result[0].version}`);
    console.log(`   Database: ${result[0].database}`);
    console.log(`   User: ${result[0].user}\n`);
    
    // Check if tables exist
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('📋 Available tables:');
    if (tables.length === 0) {
      console.log('   ⚠️  No tables found. Run migrations first: pnpm db:push');
    } else {
      tables.forEach(table => {
        console.log(`   ✓ ${table.table_name}`);
      });
    }
    
    // Count records in main tables
    console.log('\n📈 Table record counts:');
    try {
      const orderCount = await prisma.order.count();
      console.log(`   Orders: ${orderCount}`);
    } catch (e: any) {
      console.log(`   Orders: Table doesn't exist yet`);
    }
    
    try {
      const escrowCount = await prisma.escrow.count();
      console.log(`   Escrows: ${escrowCount}`);
    } catch (e: any) {
      console.log(`   Escrows: Table doesn't exist yet`);
    }
    
    try {
      const eventCount = await prisma.event.count();
      console.log(`   Events: ${eventCount}`);
    } catch (e: any) {
      console.log(`   Events: Table doesn't exist yet`);
    }
    
    console.log('\n✅ Database connection test completed successfully!');
    
  } catch (error: any) {
    console.error('\n❌ Database connection failed!\n');
    console.error('Error:', error.message);
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

