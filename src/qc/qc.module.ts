import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QcController } from './qc.controller';
import { QcService } from './qc.service';
import { QcSample, QcSampleSchema } from '../database/schemas/qc-sample.schema';
import { QcResult, QcResultSchema } from '../database/schemas/qc-result.schema';
import { IdSequence, IdSequenceSchema } from '../database/schemas/id-sequence.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QcSample.name, schema: QcSampleSchema },
      { name: QcResult.name, schema: QcResultSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
    ]),
  ],
  controllers: [QcController],
  providers: [QcService],
  exports: [QcService],
})
export class QcModule {}
