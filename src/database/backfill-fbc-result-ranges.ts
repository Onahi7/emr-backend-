import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { Result, ResultFlagEnum } from './schemas/result.schema';
import { Order } from './schemas/order.schema';
import { Patient } from './schemas/patient.schema';
import { TestCatalog } from './schemas/test-catalog.schema';
import { resolveReferenceRange } from '../common/utils/reference-range-resolver';

const FBC_CODES = new Set([
  'WBC',
  'NEUTA',
  'LYMPHA',
  'MONOA',
  'EOSA',
  'BASOA',
  'NEUT',
  'LYMPH',
  'MONO',
  'EOS',
  'BASO',
  'RBC',
  'HB',
  'HCT',
  'MCV',
  'MCH',
  'MCHC',
  'RDWCV',
  'RDWSD',
  'PLT',
  'MPV',
  'PDW',
  'PLTCT',
  'PLCR',
  'PLCC',
]);

function normalizeMchcRange(
  testCode: string,
  range?: string,
): string | undefined {
  if (!range) return range;
  if (testCode !== 'MCHC') return range;

  // Convert legacy g/L MCHC ranges to g/dL for consistent reporting.
  const rangeMatch = range.match(/^(\d+\.?\d*)\s*-\s*(\d+\.?\d*)$/);
  if (!rangeMatch) return range;

  const low = Number(rangeMatch[1]);
  const high = Number(rangeMatch[2]);
  if (Number.isNaN(low) || Number.isNaN(high)) return range;

  if (high > 100) {
    return `${(low / 10).toFixed(1)}-${(high / 10).toFixed(1)}`;
  }

  return range;
}

function calculateFlag(value: string, referenceRange?: string): ResultFlagEnum {
  if (!referenceRange) {
    return ResultFlagEnum.NORMAL;
  }

  const trimmedValue = String(value || '').trim();
  const comparisonValueMatch = trimmedValue.match(
    /^([<>]=?|≤|≥)\s*(-?\d*\.?\d+)$/,
  );
  const numericValue = comparisonValueMatch
    ? parseFloat(comparisonValueMatch[2])
    : parseFloat(trimmedValue);
  const comparisonOperator = comparisonValueMatch
    ? comparisonValueMatch[1]
    : null;

  if (Number.isNaN(numericValue)) {
    return ResultFlagEnum.NORMAL;
  }

  const rangeMatch = referenceRange.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    let effectiveValue = numericValue;

    if (
      comparisonOperator === '>' ||
      comparisonOperator === '>=' ||
      comparisonOperator === '≥'
    ) {
      effectiveValue = numericValue + 0.001;
    } else if (
      comparisonOperator === '<' ||
      comparisonOperator === '<=' ||
      comparisonOperator === '≤'
    ) {
      effectiveValue = numericValue - 0.001;
    }

    const span = high - low;
    const criticalLowThreshold = low - span * 0.3;
    const criticalHighThreshold = high + span * 0.3;

    if (effectiveValue < criticalLowThreshold)
      return ResultFlagEnum.CRITICAL_LOW;
    if (effectiveValue < low) return ResultFlagEnum.LOW;
    if (effectiveValue > criticalHighThreshold)
      return ResultFlagEnum.CRITICAL_HIGH;
    if (effectiveValue > high) return ResultFlagEnum.HIGH;
    return ResultFlagEnum.NORMAL;
  }

  const thresholdMatch = referenceRange.match(
    /^\s*(<=|>=|<|>|≤|≥)\s*(\d+\.?\d*)\s*$/,
  );
  if (thresholdMatch) {
    const rangeOperator = thresholdMatch[1];
    const threshold = parseFloat(thresholdMatch[2]);
    const rangeIsUpperBound =
      rangeOperator === '<' || rangeOperator === '<=' || rangeOperator === '≤';

    if (rangeIsUpperBound) {
      if (
        comparisonOperator === '>' ||
        comparisonOperator === '>=' ||
        comparisonOperator === '≥'
      ) {
        return ResultFlagEnum.HIGH;
      }
      if (
        comparisonOperator === '<' ||
        comparisonOperator === '<=' ||
        comparisonOperator === '≤'
      ) {
        return ResultFlagEnum.NORMAL;
      }
      return numericValue >= threshold
        ? ResultFlagEnum.HIGH
        : ResultFlagEnum.NORMAL;
    }

    if (
      comparisonOperator === '<' ||
      comparisonOperator === '<=' ||
      comparisonOperator === '≤'
    ) {
      return ResultFlagEnum.LOW;
    }
    if (
      comparisonOperator === '>' ||
      comparisonOperator === '>=' ||
      comparisonOperator === '≥'
    ) {
      return ResultFlagEnum.NORMAL;
    }
    return numericValue <= threshold
      ? ResultFlagEnum.LOW
      : ResultFlagEnum.NORMAL;
  }

  return ResultFlagEnum.NORMAL;
}

async function backfillFbcResultRanges() {
  const dryRun =
    process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

  const app = await NestFactory.createApplicationContext(AppModule);

  const resultModel = app.get<Model<Result>>(getModelToken(Result.name));
  const orderModel = app.get<Model<Order>>(getModelToken(Order.name));
  const patientModel = app.get<Model<Patient>>(getModelToken(Patient.name));
  const testCatalogModel = app.get<Model<TestCatalog>>(
    getModelToken(TestCatalog.name),
  );

  try {
    const testCatalogs = await testCatalogModel
      .find({ code: { $in: Array.from(FBC_CODES) } })
      .select('code referenceRange referenceRanges')
      .lean();

    const testCatalogByCode = new Map(testCatalogs.map((tc) => [tc.code, tc]));

    const results = await resultModel
      .find({ testCode: { $in: Array.from(FBC_CODES) } })
      .select('_id orderId testCode value referenceRange flag')
      .lean();

    console.log(
      `\n🧪 FBC backfill scan started (${results.length} results found)`,
    );
    if (dryRun) {
      console.log('   Mode: DRY RUN (no database writes)\n');
    }

    const orderIds = Array.from(
      new Set(results.map((r) => String(r.orderId)).filter(Boolean)),
    ).map((id) => new Types.ObjectId(id));

    const orders = await orderModel
      .find({ _id: { $in: orderIds } })
      .select('_id patientId')
      .lean();
    const patientIds = Array.from(
      new Set(orders.map((o) => String(o.patientId)).filter(Boolean)),
    ).map((id) => new Types.ObjectId(id));
    const patients = await patientModel
      .find({ _id: { $in: patientIds } })
      .select('_id age gender')
      .lean();

    const orderById = new Map(orders.map((o) => [String(o._id), o]));
    const patientById = new Map(patients.map((p) => [String(p._id), p]));

    let scanned = 0;
    let missingContext = 0;
    let updated = 0;
    let unchanged = 0;

    for (const result of results) {
      scanned += 1;

      const order = orderById.get(String(result.orderId));
      const patient = order?.patientId
        ? patientById.get(String(order.patientId))
        : undefined;
      const testCatalog = testCatalogByCode.get(result.testCode);

      if (!patient || !testCatalog) {
        missingContext += 1;
        continue;
      }

      const resolved = resolveReferenceRange({
        age: patient.age,
        gender: patient.gender,
        referenceRanges: testCatalog.referenceRanges,
        simpleReferenceRange: testCatalog.referenceRange,
      });

      const nextReferenceRange = normalizeMchcRange(result.testCode, resolved);
      const nextFlag = calculateFlag(result.value, nextReferenceRange);

      const hasReferenceRangeChanged =
        (result.referenceRange || '') !== (nextReferenceRange || '');
      const hasFlagChanged = result.flag !== nextFlag;

      if (!hasReferenceRangeChanged && !hasFlagChanged) {
        unchanged += 1;
        continue;
      }

      if (!dryRun) {
        await resultModel.updateOne(
          { _id: result._id },
          {
            $set: {
              referenceRange: nextReferenceRange,
              flag: nextFlag,
            },
          },
        );
      }

      updated += 1;
    }

    console.log('✅ FBC backfill completed');
    console.log(`   Scanned: ${scanned}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Unchanged: ${unchanged}`);
    console.log(`   Missing context: ${missingContext}`);
    if (dryRun) {
      console.log(
        '   Dry-run only. Re-run without --dry-run to apply changes.',
      );
    }
  } finally {
    await app.close();
  }
}

backfillFbcResultRanges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ FBC result backfill failed:', error);
    process.exit(1);
  });
