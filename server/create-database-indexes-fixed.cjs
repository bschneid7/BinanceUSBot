const mongoose = require('mongoose');

// MongoDB connection string from production environment
const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

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
    
    await db.collection('trades').createIndex({ symbol: 1, createdAt: -1 });
    console.log('✓ Created index: trades.symbol_createdAt');

    // BotState indexes
    console.log('\nCreating BotState indexes...');
    await db.collection('botstates').createIndex({ userId: 1 }, { unique: true });
    console.log('✓ Created index: botstates.userId (unique)');

    // MLPerformanceLog indexes
    console.log('\nCreating MLPerformanceLog indexes...');
    await db.collection('mlperformancelogs').createIndex({ timestamp: -1 });
    console.log('✓ Created index: mlperformancelogs.timestamp');
    
    await db.collection('mlperformancelogs').createIndex({ decision: 1, timestamp: -1 });
    console.log('✓ Created index: mlperformancelogs.decision_timestamp');
    
    await db.collection('mlperformancelogs').createIndex({ symbol: 1, timestamp: -1 });
    console.log('✓ Created index: mlperformancelogs.symbol_timestamp');

    // Order idempotency indexes
    console.log('\nCreating Order idempotency indexes...');
    await db.collection('orders').createIndex({ 
      userId: 1, 
      symbol: 1, 
      side: 1, 
      type: 1, 
      quantity: 1, 
      createdAt: 1 
    }, { 
      name: 'order_idempotency',
      expireAfterSeconds: 300 // 5 minutes TTL
    });
    console.log('✓ Created index: orders.order_idempotency (with 5min TTL)');

    console.log('\n✅ All indexes created successfully!');
    
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createIndexes();

