# Data Reset Guide (Administrator Only)

This guide is for administrators to reset the application data to start fresh.

## ⚠️ Important Warnings

- This operation is IRREVERSIBLE
- All patient data, orders, results, and payments will be permanently deleted
- Test catalog, panels, and user accounts will be preserved
- Always backup your database before running these scripts

## What Gets Deleted

✗ Orders
✗ Patients  
✗ Results
✗ Payments
✗ Samples
✗ Audit Logs

## What Gets Preserved

✓ Test Catalog
✓ Test Panels
✓ User Accounts
✓ System Settings
✓ Machine Configurations

## Step-by-Step Reset Process

### 1. Backup Database (CRITICAL)

If using MongoDB Atlas:
```bash
# Export all collections
mongodump --uri="your-mongodb-connection-string" --out=./backup-$(date +%Y%m%d)
```

If using local MongoDB:
```bash
mongodump --db=lis_production --out=./backup-$(date +%Y%m%d)
```

### 2. Run the Reset Script

```bash
cd backend
npm run reset:data
```

The script will:
1. Show current data counts
2. Display what will be deleted and preserved
3. Delete all transactional data
4. Verify the deletion
5. Show final counts

### 3. Verify the Reset

After running the script, you should see:
```
✅ Verification:
   Orders remaining: 0
   Patients remaining: 0
   Results remaining: 0
   Payments remaining: 0
   Samples remaining: 0
   Audit Logs remaining: 0
```

### 4. Restart the Backend (if running)

```bash
# If running locally
npm run start:dev

# If on Heroku
heroku restart --app carefam-lab
```

### 5. Clear Frontend Cache (Optional)

Users may have cached data in their browsers. They can:
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Or wait for the app to sync with the empty backend

## Manual Database Reset (Alternative)

If you prefer to use MongoDB directly:

```javascript
// Connect to your MongoDB
use lis_production

// Delete transactional data
db.orders.deleteMany({})
db.patients.deleteMany({})
db.results.deleteMany({})
db.payments.deleteMany({})
db.samples.deleteMany({})
db.auditlogs.deleteMany({})

// Verify
db.orders.countDocuments()
db.patients.countDocuments()
db.results.countDocuments()
```

## Restore from Backup (If Needed)

If you need to restore data:

```bash
# Restore all collections
mongorestore --uri="your-mongodb-connection-string" ./backup-20260323

# Or restore specific collections
mongorestore --uri="your-mongodb-connection-string" --nsInclude="lis_production.orders" ./backup-20260323
```

## Testing After Reset

1. Login to the application
2. Verify dashboard shows zero counts
3. Create a test patient
4. Create a test order
5. Verify everything works correctly

## Troubleshooting

### Script fails with "Model not found"
- Ensure you're in the backend directory
- Run `npm install` to ensure dependencies are installed
- Check that MongoDB connection is working

### Data still appears after reset
- Clear browser cache
- Check if you're connected to the correct database
- Verify the script completed successfully

### Need to reset specific data only
Edit the script `src/database/reset-transactional-data.ts` and comment out the collections you want to keep.

## Production Considerations

For production environments:
1. Schedule maintenance window
2. Notify all users
3. Take full database backup
4. Run reset during low-usage hours
5. Verify system functionality
6. Monitor for any issues

## Contact

If you encounter issues, check:
- MongoDB connection string is correct
- Database user has delete permissions
- Backend application can connect to database
