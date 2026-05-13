import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Order } from './schemas/order.schema';

/**
 * Diagnostic: Today's orders, discounts, and fractional totals.
 * Run with: pnpm check:today-orders
 */

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const orderModel = app.get<Model<Order>>(getModelToken(Order.name));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const orders = await orderModel
    .find({ createdAt: { $gte: todayStart, $lte: todayEnd } })
    .populate('patientId', 'firstName lastName patientId')
    .sort({ createdAt: 1 })
    .lean();

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  TODAY'S ORDERS  (${todayStart.toDateString()})`);
  console.log(`${'═'.repeat(80)}\n`);
  console.log(`  Total orders: ${orders.length}`);

  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const totalPaid = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const totalBalance = orders.reduce((s, o) => s + (o.balance || 0), 0);
  const discountedOrders = orders.filter(o => (o.discount || 0) > 0);
  const fractionalOrders = orders.filter(o => {
    const t = o.total || 0;
    const p = o.amountPaid || 0;
    const b = o.balance || 0;
    return (t % 1 !== 0) || (p % 1 !== 0) || (b % 1 !== 0);
  });

  console.log(`  Total revenue (sum of totals): Le ${totalRevenue.toLocaleString()}`);
  console.log(`  Total paid:   Le ${totalPaid.toLocaleString()}`);
  console.log(`  Outstanding:  Le ${totalBalance.toLocaleString()}`);
  console.log(`  Orders with discounts: ${discountedOrders.length}`);
  console.log(`  Orders with fractional values: ${fractionalOrders.length}`);

  // ── Per-order breakdown ───────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(80)}`);
  console.log('  ORDER BREAKDOWN');
  console.log(`${'─'.repeat(80)}`);

  for (const o of orders) {
    const patient: any = o.patientId;
    const patName = patient
      ? `${patient.firstName} ${patient.lastName} (${patient.patientId})`
      : 'Unknown';
    const hasFraction = (o.total % 1 !== 0) || ((o.amountPaid || 0) % 1 !== 0) || ((o.balance || 0) % 1 !== 0);
    const hasDiscount = (o.discount || 0) > 0;

    const flags = [
      hasFraction ? '⚠️  FRACTION' : null,
      hasDiscount ? `💸 DISCOUNT(${o.discountType === 'percentage' ? o.discount + '%' : 'Le ' + o.discount})` : null,
    ].filter(Boolean).join('  ');

    console.log(`\n  ${o.orderNumber}  ${patName}`);
    console.log(`    Subtotal: Le ${(o.subtotal || 0).toLocaleString()}  |  Discount: Le ${(o.discount || 0).toLocaleString()} (${o.discountType || '-'})  |  Total: Le ${(o.total || 0).toLocaleString()}`);
    console.log(`    Paid: Le ${(o.amountPaid || 0).toLocaleString()}  |  Balance: Le ${(o.balance || 0).toLocaleString()}  |  Status: ${o.paymentStatus} / ${o.status}`);
    if (flags) console.log(`    ${flags}`);
  }

  // ── Discount deep-dive ────────────────────────────────────────────────────
  if (discountedOrders.length > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log('  DISCOUNTED ORDERS — WHY FRACTIONS OCCUR');
    console.log(`${'─'.repeat(80)}`);
    console.log('  Percentage discounts cause fractions when subtotal is not divisible evenly.');
    console.log('  Example: Le 430 subtotal × 10% discount = Le 387 (OK)');
    console.log('           Le 430 subtotal × 15% discount = Le 365.5 (FRACTION ⚠️ )\n');

    for (const o of discountedOrders) {
      const patient: any = o.patientId;
      const patName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
      const sub = o.subtotal || 0;
      const disc = o.discount || 0;
      const total = o.total || 0;
      const computedExact = o.discountType === 'percentage'
        ? sub * (1 - disc / 100)
        : sub - disc;
      const hasFraction = computedExact % 1 !== 0;

      console.log(`  ${o.orderNumber} — ${patName}`);
      console.log(`    Subtotal: Le ${sub}  |  Discount: ${o.discountType === 'percentage' ? disc + '%' : 'Le ' + disc}`);
      console.log(`    Exact computed: Le ${computedExact}  |  Stored total: Le ${total}${hasFraction ? '  ← FRACTION (rounded to 2dp)' : ''}`);
    }
  }

  // ── Fraction cause summary ────────────────────────────────────────────────
  if (fractionalOrders.length > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log('  ROOT CAUSE OF FRACTIONS');
    console.log(`${'─'.repeat(80)}`);
    console.log('  Fractions come from percentage discounts on non-round subtotals.');
    console.log('  The system rounds to 2 decimal places but does NOT round to nearest integer.');
    console.log('  Fix: Round totals to the nearest whole number (Math.round) instead of 2 dp.\n');
  } else if (discountedOrders.length === 0) {
    console.log('\n  ✅ No fractional values and no discounts found today.\n');
  }

  console.log(`${'═'.repeat(80)}\n`);
  await app.close();
}

bootstrap().catch(e => {
  console.error(e);
  process.exit(1);
});
