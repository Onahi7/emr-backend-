import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServicePrice, ServicePriceSchema } from '../database/schemas/service-price.schema';
import { ServicePricesController } from './service-prices.controller';
import { ServicePricesService } from './service-prices.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ServicePrice.name, schema: ServicePriceSchema }]),
  ],
  controllers: [ServicePricesController],
  providers: [ServicePricesService],
  exports: [ServicePricesService],
})
export class ServicePricesModule {}
