const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function fixModelStatus() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected\n');

    const MLModel = mongoose.model('MLModel', new mongoose.Schema({}));

    // Find the deployed model
    const model = await MLModel.findOne({ isDeployed: true });
    
    if (!model) {
      console.error('ERROR: No deployed model found!');
      process.exit(1);
    }

    console.log(`Found model: ${model._id}`);
    console.log(`Current status: ${model.status}`);
    console.log('');

    // Update status to ACTIVE
    model.status = 'ACTIVE';
    await model.save();

    console.log('✓ Model status updated to ACTIVE');
    console.log('');
    console.log('Model Details:');
    console.log(`  ID: ${model._id}`);
    console.log(`  Type: ${model.modelType}`);
    console.log(`  Version: ${model.version}`);
    console.log(`  Status: ${model.status}`);
    console.log(`  Deployed: ${model.isDeployed}`);
    console.log('');

    await mongoose.disconnect();
    console.log('✓ Done!');
    process.exit(0);

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

fixModelStatus();

