import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestCatalogService } from './test-catalog.service';
import { TestCatalogController, TestPanelsController } from './test-catalog.controller';
import { TestCatalog, TestCatalogSchema } from '../database/schemas/test-catalog.schema';
import { TestPanel, TestPanelSchema } from '../database/schemas/test-panel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TestCatalog.name, schema: TestCatalogSchema },
      { name: TestPanel.name, schema: TestPanelSchema },
    ]),
  ],
  controllers: [TestCatalogController, TestPanelsController],
  providers: [TestCatalogService],
  exports: [TestCatalogService],
})
export class TestCatalogModule {}
