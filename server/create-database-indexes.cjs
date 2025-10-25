const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://bschneid7:Rodrigo1102@cluster0.ixfvb.mongodb.net/binance-bot?retryWrites=true&w=majority&appName=Cluster0';

async function createIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully');

    const db = mongoose.connection.db;

    // Position indexes
    console.log('\nCreating Position indexes...');
    await db.collection('positions').createIndex({ userId: 1, status: 1 });
    console.log('✓ Created index: positions.userId_status');
    
    await db.collection('positions').createIndex({ symbol: 1, status: 1 });
    console.log('✓ Created index: positions.symbol_status');
    
    await db.collection('positions').createIndex({ userId: 1, createdAt: -1 });
    console.log('✓ Created index: positions.userId_createdAt');

    // Trade indexes
    console.log('\nCreating Trade indexes...');
    await db.collection('trades').createIndex({ userId: 1, closed_at: -1 });
    console.log('✓ Created index: trades.userId_closedAt');
    
    await db.collection('trades').createIndex({ userId: 1, symbol: 1 });
    console.log('✓ Created index: trades.userId_symbol');
    
    await db.collection('trades').createIndex({ positionId: 1 });
    console.log('✓ Created index: trades.positionId');

    // Order indexes
    console.log('\nCreating Order indexes...');
    await db.collection('orders').createIndex({ userId: 1, status: 1 });
    console.log('✓ Created index: orders.userId_status');
    
    await db.collection('orders').createIndex({ exchangeOrderId: 1 }, { unique: true, sparse: true });
    console.log('✓ Created index: orders.exchangeOrderId (unique)');
    
    await db.collection('orders').createIndex({ clientOrderId: 1 }, { unique: true, sparse: true });
    console.log('✓ Created index: orders.clientOrderId (unique)');

    // MLPerformanceLog indexes
    console.log('\nCreating MLPerformanceLog indexes...');
    await db.collection('mlperformancelogs').createIndex({ userId: 1, timestamp: -1 });
    console.log('✓ Created index: mlperformancelogs.userId_timestamp');
    
    await db.collection('mlperformancelogs').createIndex({ userId: 1, approved: 1 });
    console.log('✓ Created index: mlperformancelogs.userId_approved');
    
    await db.collection('mlperformancelogs').createIndex({ userId: 1, playbook: 1 });
    console.log('✓ Created index: mlperformancelogs.userId_playbook');

    // BotState indexes
    console.log('\nCreating BotState indexes...');
    await db.collection('botstates').createIndex({ userId: 1 }, { unique: true });
    console.log('✓ Created index: botstates.userId (unique)');

    // BotConfig indexes
    console.log('\nCreating BotConfig indexes...');
    await db.collection('botconfigs').createIndex({ userId: 1 }, { unique: true });
    console.log('✓ Created index: botconfigs.userId (unique)');

    console.log('\n✅ All indexes created successfully!');
    
    // List all indexes
    console.log('\n📊 Index Summary:');
    const collections = ['positions', 'trades', 'orders', 'mlperformancelogs', 'botstates', 'botconfigs'];
    for (const collName of collections) {
      const indexes = await db.collection(collName).indexes();
      console.log(`\n${collName}: ${indexes.length} indexes`);
      indexes.forEach(idx => {
        console.log(`  - ${idx.name}`);
      });
    }

  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

createIndexes();

