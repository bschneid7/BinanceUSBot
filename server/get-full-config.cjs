const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function getFullConfig() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    
    const config = await db.collection('botconfigs').findOne({});
    if (!config) {
      console.log('No configuration found');
      return;
    }

    console.log(JSON.stringify(config, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

getFullConfig();

