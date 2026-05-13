import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Use raw mongoose models via app.get
  const paymentModel = app.get<Model<any>>(getModelToken('Payment'));
  const expenditureModel = app.get<Model<any>>(getModelToken('Expenditure'));
  const recModel = app.get<Model<any>>(getModelToken('CashReconciliation'));

  // ── Payments (gross collected) ──────────────────────────────────────────────
  const payments = await paymentModel.find({
    createdAt: { $gte: today, $lt: tomorrow },
    status: { $ne: 'cancelled' },
  }).lean();

  let cashTotal = 0, orangeTotal = 0, afriTotal = 0;
  payments.forEach((p: any) => {
    const method = p.paymentMethod || 'cash';
    const amt = Number(p.amount) || 0;
    if (method === 'cash') cashTotal += amt;
    else if (method === 'orange_money') orangeTotal += amt;
    else if (method === 'afrimoney') afriTotal += amt;
    console.log(`  Payment [${method}] Le ${amt} — orderId: ${p.order || p.orderId || 'n/a'}`);
  });

  const grossTotal = cashTotal + orangeTotal + afriTotal;
  console.log('\n=== GROSS COLLECTED TODAY ===');
  console.log(`Cash:         Le ${cashTotal}`);
  console.log(`Orange Money: Le ${orangeTotal}`);
  console.log(`Afrimoney:    Le ${afriTotal}`);
  console.log(`TOTAL:        Le ${grossTotal}`);
  console.log(`Payment count: ${payments.length}`);

  // ── Expenditures ────────────────────────────────────────────────────────────
  const exps = await expenditureModel.find({
    createdAt: { $gte: today, $lt: tomorrow },
  }).lean();

  let cashExp = 0, orangeExp = 0, afriExp = 0;
  exps.forEach((e: any) => {
    const method = e.paymentMethod || 'cash';
    const amt = Number(e.amount) || 0;
    if (method === 'cash') cashExp += amt;
    else if (method === 'orange_money') orangeExp += amt;
    else if (method === 'afrimoney') afriExp += amt;
    else cashExp += amt;
    console.log(`  Expenditure [${method}] Le ${amt} — ${e.description}`);
  });

  const totalExp = cashExp + orangeExp + afriExp;
  console.log('\n=== EXPENDITURES TODAY ===');
  console.log(`Cash Exp:   Le ${cashExp}`);
  console.log(`Orange Exp: Le ${orangeExp}`);
  console.log(`Afri Exp:   Le ${afriExp}`);
  console.log(`Total Exp:  Le ${totalExp}`);

  console.log('\n=== NET EXPECTED (gross - expenditures per method) ===');
  console.log(`Cash Net:   Le ${cashTotal} - Le ${cashExp} = Le ${cashTotal - cashExp}`);
  console.log(`Orange Net: Le ${orangeTotal} - Le ${orangeExp} = Le ${orangeTotal - orangeExp}`);
  console.log(`Afri Net:   Le ${afriTotal} - Le ${afriExp} = Le ${afriTotal - afriExp}`);
  console.log(`Total Net:  Le ${grossTotal} - Le ${totalExp} = Le ${grossTotal - totalExp}`);

  // ── Saved reconciliations ───────────────────────────────────────────────────
  const recs = await recModel.find({
    reconciliationDate: { $gte: today, $lt: tomorrow },
  }).lean();

  console.log('\n=== SAVED RECONCILIATIONS TODAY ===');
  if (recs.length === 0) {
    console.log('(none saved today yet)');
  }
  recs.forEach((r: any, i: number) => {
    console.log(`\n-- Record ${i + 1} --`);
    console.log(`  expectedCash:    Le ${r.expectedCash}`);
    console.log(`  expectedOrange:  Le ${r.expectedOrangeMoney}`);
    console.log(`  expectedAfri:    Le ${r.expectedAfrimoney}`);
    console.log(`  expectedTotal:   Le ${r.expectedTotal}`);
    console.log(`  actualCash:      Le ${r.actualCash}`);
    console.log(`  actualTotal:     Le ${r.actualTotal}`);
    console.log(`  totalVariance:   Le ${r.totalVariance}`);
    console.log(`  DIAGNOSIS — expectedTotal matches DB net? ${r.expectedTotal === (grossTotal - totalExp) ? 'YES ✓' : `NO ✗ (DB net = ${grossTotal - totalExp})`}`);
  });

  await app.close();
}

bootstrap().catch(console.error);
