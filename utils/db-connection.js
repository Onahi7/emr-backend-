/**
 * Database Connection Utility
 * 
 * Provides a centralized way to connect to MongoDB using environment variables.
 * All scripts should use this instead of hardcoding connection strings.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

/**
 * Load environment variables from .env file
 */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️  .env file not found. Using default connection string.');
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key.trim()] = value;
      }
    }
  });
}

/**
 * Get MongoDB connection string from environment
 */
function getMongoUri() {
  loadEnv();
  
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lims';
  
  if (uri === 'mongodb://localhost:27017/lims') {
    console.warn('⚠️  Using default MongoDB connection. Set MONGODB_URI in .env file.');
  }
  
  return uri;
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  const uri = getMongoUri();
  
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error.message);
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  getMongoUri,
};
