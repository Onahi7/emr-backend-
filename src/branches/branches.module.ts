import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { Branch, BranchSchema } from './branch.schema';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
    MongooseModule.forFeature([{ name: Branch.name, schema: BranchSchema }]),
    UsersModule,
  ],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
