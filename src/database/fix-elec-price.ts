import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TestPanel } from './schemas/test-panel.schema';

async function fixElecPrice() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testPanelModel = app.get<Model<TestPanel>>(getModelToken(TestPanel.name));

  const result = await testPanelModel.updateOne(
    { code: 'ELEC' },
    { $set: { price: 190 } },
  );
  console.log(`Updated ${result.modifiedCount} panel(s)`);

  const panel = await testPanelModel.findOne({ code: 'ELEC' }).exec();
  if (panel) {
    console.log(`ELEC price: ${panel.price}`);
    console.log(`Tests count: ${panel.tests?.length || 0}`);
  }

  await app.close();
}

fixElecPrice()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
