import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lab');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get today's payments (gross collected)
  const PaymentSchema = new mongoose.Schema({ amount: Number, paymentMethod: String, createdAt: Date, status: String }, { strict: false });
  const Payment = mongoose.model('Payment', PaymentSchema);

  const payments = await Payment.find({ createdAt: { $gte: today, $lt: tomorrow }, status: { $ne: 'cancelled' } } as any);

  let cashTotal = 0, orangeTotal = 0, afriTotal = 0;
  payments.forEach((p: any) => {
    if (p.paymentMethod === 'cash') cashTotal += p.amount;
    else if (p.paymentMethod === 'orange_money') orangeTotal += p.amount;
    else if (p.paymentMethod === 'afrimoney') afriTotal += p.amount;
    console.log(`  Payment: ${p.paymentMethod} Le ${p.amount}`);
  });

  console.log('\n=== GROSS COLLECTED TODAY ===');
  console.log('Cash:', cashTotal);
  console.log('Orange Money:', orangeTotal);
  console.log('Afrimoney:', afriTotal);
  console.log('TOTAL:', cashTotal + orangeTotal + afriTotal);
  console.log('Payment count:', payments.length);

  // Get today's expenditures
  const ExpSchema = new mongoose.Schema({ amount: Number, paymentMethod: String, description: String, createdAt: Date }, { strict: false });
  const Expenditure = mongoose.model('Expenditure', ExpSchema);

  const exps = await Expenditure.find({ createdAt: { $gte: today, $lt: tomorrow } } as any);

  let cashExp = 0, orangeExp = 0, afriExp = 0;
  exps.forEach((e: any) => {
    const method = e.paymentMethod || 'cash';
    if (method === 'cash') cashExp += e.amount;
    else if (method === 'orange_money') orangeExp += e.amount;
    else if (method === 'afrimoney') afriExp += e.amount;
    else cashExp += e.amount;
    console.log(`  Expenditure: ${method} Le ${e.amount} — ${e.description}`);
  });

  console.log('\n=== EXPENDITURES TODAY ===');
  console.log('Cash Exp:', cashExp);
  console.log('Orange Exp:', orangeExp);
  console.log('Afri Exp:', afriExp);
  console.log('Total Exp:', cashExp + orangeExp + afriExp);

  console.log('\n=== NET EXPECTED (gross - expenditures) ===');
  console.log('Cash Net:', cashTotal - cashExp);
  console.log('Orange Net:', orangeTotal - orangeExp);
  console.log('Afri Net:', afriTotal - afriExp);
  console.log('Total Net:', (cashTotal + orangeTotal + afriTotal) - (cashExp + orangeExp + afriExp));

  // Check what the service's getExpectedAmounts would return
  // Pull the reconciliation service logic inline
  const RecSchema = new mongoose.Schema({
    expectedCash: Number, expectedOrangeMoney: Number, expectedAfrimoney: Number,
    expectedTotal: Number, actualCash: Number, actualOrangeMoney: Number,
    actualAfrimoney: Number, actualTotal: Number, cashVariance: Number,
    totalVariance: Number, reconciliationDate: Date
  }, { strict: false });
  const Rec = mongoose.model('CashReconciliation', RecSchema);

  const recs = await Rec.find({ reconciliationDate: { $gte: today, $lt: tomorrow } } as any);
  console.log('\n=== SAVED RECONCILIATIONS TODAY ===');
  if (recs.length === 0) console.log('(none saved today)');
  recs.forEach((r: any) => {
    console.log(`expectedCash: ${r.expectedCash} | expectedOrange: ${r.expectedOrangeMoney} | expectedAfri: ${r.expectedAfrimoney} | expectedTotal: ${r.expectedTotal}`);
    console.log(`actualCash: ${r.actualCash} | actualTotal: ${r.actualTotal} | totalVariance: ${r.totalVariance}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
