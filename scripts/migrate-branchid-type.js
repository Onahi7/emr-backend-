/**
 * Migration: Convert string branchId to ObjectId across all collections.
 * 
 * Some collections have branchId stored as a string (from early data entry
 * before Mongoose auto-casting was consistent). This migration converts
 * all string-typed branchId fields to proper ObjectId.
 * 
 * Usage: node scripts/migrate-branchid-type.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8']);

const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://cluster0.abdi7yt.mongodb.net/?authSource=admin';
const dbName = 'carefaamemr';

// All collections that have a branchId field
const collections = [
  'visits',
  'patients',
  'orders',
  'order_tests',
  'payments',
  'prescriptions',
  'consultations',
  'samples',
  'soap_notes',
  'treatment_plans',
  'queue',
  'admissions',
  'expenditures',
  'appointments',
  'doctors',
  'insurance-claims',
  'insuranceblocks',
  'stock_movements',
  'wallet_transactions',
  'communication_logs',
  'patient_notes',
  'audit_logs',
  'cash_reconciliations',
  'medicationadministrations',
  'critical_result_notifications',
  'panel_interpretations',
  'qc_samples',
  'qc_results',
  'machine_maintenance',
  'report_templates',
];

async function migrate() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log(`Starting branchId type migration for ${collections.length} collections...\n`);

  let totalFixed = 0;

  for (const collName of collections) {
    try {
      const coll = db.collection(collName);

      // Count documents where branchId is a string (not ObjectId)
      const stringCount = await coll.countDocuments({
        branchId: { $type: 'string' }
      });

      if (stringCount === 0) {
        console.log(`  ${collName}: 0 string branchIds — skipping`);
        continue;
      }

      // Convert string branchId to ObjectId
      const result = await coll.updateMany(
        { branchId: { $type: 'string' } },
        [{ $set: { branchId: { $toObjectId: '$branchId' } } }]
      );

      console.log(`  ${collName}: ${stringCount} documents migrated (${result.modifiedCount} modified)`);
      totalFixed += result.modifiedCount;
    } catch (err) {
      console.log(`  ${collName}: ERROR — ${err.message}`);
    }
  }

  console.log(`\nMigration complete. Total documents fixed: ${totalFixed}`);
  await client.close();
}

migrate().catch(console.error);
