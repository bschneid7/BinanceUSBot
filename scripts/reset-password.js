/**
 * Password Reset Script
 * 
 * This script resets the password for a user in the database.
 * Usage: node scripts/reset-password.js <email> <newPassword>
 * 
 * Example: node scripts/reset-password.js bschneid7@gmail.com Rodrigo1102
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node reset-password.js <email> <newPassword>');
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error('Error: MONGO_URI or DATABASE_URL environment variable is missing');
  process.exit(1);
}

// Define User schema inline
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  refreshToken: String
});

const User = mongoose.model('User', UserSchema);

async function resetPassword() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    console.log(`Looking for user: ${email}`);
    const user = await User.findOne({ email });

    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    console.log('User found, hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    console.log('Updating password in database...');
    user.password = hashedPassword;
    await user.save();

    console.log(`✅ Password successfully reset for: ${email}`);
    console.log(`New password: ${newPassword}`);
    
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  }
}

resetPassword();

