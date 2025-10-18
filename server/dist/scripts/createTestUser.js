import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import UserService from '../services/userService';
// Load environment variables
dotenv.config();
/**
 * Script to create a test user for development
 */
async function createTestUser() {
    try {
        console.log('Starting test user creation script...');
        // Connect to database
        await connectDB();
        console.log('Database connected successfully');
        const testUserEmail = 'test@example.com';
        const testUserPassword = 'password123';
        // Check if user already exists
        const existingUser = await UserService.getByEmail(testUserEmail);
        if (existingUser) {
            console.log(`User ${testUserEmail} already exists with ID: ${existingUser._id}`);
            console.log('You can use this user for testing.');
            process.exit(0);
        }
        // Create test user
        console.log(`Creating test user: ${testUserEmail}`);
        const user = await UserService.create({
            email: testUserEmail,
            password: testUserPassword,
        });
        console.log(`\nTest user created successfully!`);
        console.log(`  Email: ${user.email}`);
        console.log(`  ID: ${user._id}`);
        console.log(`  Password: ${testUserPassword}`);
        console.log('\nYou can now run the seed scripts or log in with these credentials.');
    }
    catch (error) {
        console.error('Error creating test user:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        process.exit(1);
    }
    finally {
        // Close database connection
        await mongoose.connection.close();
        console.log('\nDatabase connection closed');
        process.exit(0);
    }
}
// Run the script
createTestUser();
//# sourceMappingURL=createTestUser.js.map