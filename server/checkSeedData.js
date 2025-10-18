const mongoose = require('mongoose');
require('dotenv').config();

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/BinanceUSBot');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📦 Collections in database:');
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`   ${col.name}: ${count} documents`);
    }
    
    await mongoose.connection.close();
    console.log('\n✅ Database check complete\n');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkData();
