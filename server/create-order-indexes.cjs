const mongoose = require('mongoose');

// MongoDB connection string from production environment
const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function createOrderIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully');

    const db = mongoose.connection.db;

    // Order idempotency index (compound, no TTL)
    console.log('\nCreating Order idempotency index...');
    await db.collection('orders').createIndex({ 
      userId: 1, 
      symbol: 1, 
      side: 1, 
      type: 1, 
      quantity: 1, 
      createdAt: 1 
    }, { 
      name: 'order_idempotency'
    });
    console.log('✓ Created index: orders.order_idempotency');

    // Order TTL index (single field with TTL)
    console.log('\nCreating Order TTL index...');
    await db.collection('orders').createIndex({ 
      createdAt: 1 
    }, { 
      name: 'order_ttl',
      expireAfterSeconds: 2592000 // 30 days
    });
    console.log('✓ Created index: orders.order_ttl (30 day TTL)');

    console.log('\n✅ Order indexes created successfully!');
    
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createOrderIndexes();
