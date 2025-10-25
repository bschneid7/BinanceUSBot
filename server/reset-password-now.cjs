const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function resetPassword() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    const User = mongoose.model('User', new mongoose.Schema({
      email: String,
      password: String,
      isActive: Boolean,
      role: String,
      lastLoginAt: Date
    }, { timestamps: true }));

    const user = await User.findOne({ email: 'bschneid7@gmail.com' });
    
    if (!user) {
      console.error('❌ User not found!');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.email}`);
    console.log(`   User ID: ${user._id}\n`);

    // Hash the password
    const newPassword = 'Rodrigo1102';
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed\n');

    // Update user
    user.password = hashedPassword;
    await user.save();

    console.log('═══════════════════════════════════════');
    console.log('✅ PASSWORD RESET SUCCESSFUL');
    console.log('═══════════════════════════════════════');
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${newPassword}`);
    console.log('═══════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

resetPassword();

