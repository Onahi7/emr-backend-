import { connect, disconnect } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

// Read .env file
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(__dirname, '../../.env.development'),
  path.join(__dirname, '../../.env.production'),
];
let MONGODB_URI = 'mongodb://localhost:27017/lis';

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const mongoUriMatch = envContent.match(/MONGODB_URI=(.+)/);
    if (mongoUriMatch) {
      MONGODB_URI = mongoUriMatch[1].trim();
      break;
    }
  }
}

async function seedAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    const connection = await connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = connection.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // Check if admin already exists
    const profilesCollection = db.collection('profiles');
    const existingAdmin = await profilesCollection.findOne({ email: 'admin@lab.com' });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
      
      // Update password if needed
      const passwordHash = await bcrypt.hash('Admin@2026', 10);
      await profilesCollection.updateOne(
        { email: 'admin@lab.com' },
        { 
          $set: { 
            passwordHash,
            updatedAt: new Date()
          } 
        }
      );
      console.log('✅ Admin password updated');
    } else {
      // Create new admin user
      console.log('👤 Creating admin user...');
      
      const passwordHash = await bcrypt.hash('Admin@2026', 10);
      
      const adminProfile = {
        email: 'admin@lab.com',
        passwordHash,
        fullName: 'System Administrator',
        phone: '+1234567890',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await profilesCollection.insertOne(adminProfile);
      console.log('✅ Admin profile created with ID:', result.insertedId);

      // Assign admin role
      const userRolesCollection = db.collection('user_roles');
      await userRolesCollection.insertOne({
        userId: result.insertedId,
        role: 'admin',
        createdAt: new Date(),
      });
      console.log('✅ Admin role assigned');
    }

    console.log('\n📋 Admin Credentials:');
    console.log('   Email: admin@lab.com');
    console.log('   Password: Admin@2026');
    console.log('\n✨ Seeding completed successfully!');

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error seeding admin:', errorMessage);
    process.exit(1);
  } finally {
    await disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seed function
seedAdmin();
