import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExpendituresController } from './expenditures.controller';
import { ExpendituresService } from './expenditures.service';
import {
  Expenditure,
  ExpenditureSchema,
} from '../database/schemas/expenditure.schema';
import { Profile, ProfileSchema } from '../database/schemas/profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expenditure.name, schema: ExpenditureSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [ExpendituresController],
  providers: [ExpendituresService],
  exports: [ExpendituresService],
})
export class ExpendituresModule {}
