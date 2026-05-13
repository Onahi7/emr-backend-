import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { Machine } from './schemas/machine.schema';
import { getModelToken } from '@nestjs/mongoose';

async function seedMachines() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const machineModel = app.get<Model<Machine>>(getModelToken(Machine.name));

  console.log('🔧 Seeding laboratory analyzers...\n');

  const machines = [
    {
      name: 'ZYBIO EXC 200',
      manufacturer: 'ZYBIO',
      modelName: 'EXC 200',
      serialNumber: 'EXC200-2024-001',
      protocol: 'HL7',
      status: 'offline',
      ipAddress: '192.168.1.100', // Configure this to match your network
      port: 5000,
      testsSupported: [
        'CBC',
        'WBC-DIFF',
        'HB',
        'PCV',
        'ESR',
        'PT',
        'APTT',
        'INR',
      ],
    },
    {
      name: 'ZYBIO Z52',
      manufacturer: 'ZYBIO',
      modelName: 'Z52',
      serialNumber: 'Z52-2024-001',
      protocol: 'HL7',
      status: 'offline',
      ipAddress: '192.168.1.101', // Configure this to match your network
      port: 5001,
      testsSupported: [
        'BMP',
        'CMP',
        'LFT',
        'RFT',
        'LIPID',
        'ELEC',
        'FBS',
        'RBS',
        'UA',
        'CREAT',
        'BUN',
      ],
    },
    {
      name: 'WONDFO Finecare PLUS',
      manufacturer: 'WONDFO',
      modelName: 'Finecare PLUS',
      serialNumber: 'FC-PLUS-2024-001',
      protocol: 'ASTM', // May need to verify with actual device
      status: 'offline',
      // Note: WONDFO may use USB/Serial instead of TCP/IP
      // Leave IP/Port empty if not network-capable
      ipAddress: undefined,
      port: undefined,
      testsSupported: [
        'CRP',
        'PCT',
        'DDIM',
        'HBA1C',
        'TSH',
        'T3',
        'T4',
        'CTNI',
        'BNPRO',
        'PSA',
      ],
    },
  ];

  for (const machineData of machines) {
    try {
      // Check if machine already exists
      const existing = await machineModel.findOne({
        name: machineData.name,
      });

      if (existing) {
        console.log(`⚠️  Machine already exists: ${machineData.name}`);
        console.log(`   Updating configuration...`);
        
        await machineModel.findByIdAndUpdate(existing._id, machineData);
        console.log(`✅ Updated: ${machineData.name}\n`);
      } else {
        const machine = new machineModel(machineData);
        await machine.save();
        console.log(`✅ Created: ${machineData.name}`);
        console.log(`   Manufacturer: ${machineData.manufacturer}`);
        console.log(`   Model: ${machineData.modelName}`);
        console.log(`   Protocol: ${machineData.protocol}`);
        if (machineData.ipAddress) {
          console.log(`   Network: ${machineData.ipAddress}:${machineData.port}`);
        } else {
          console.log(`   Network: Not configured (USB/Serial)`);
        }
        console.log(`   Tests: ${machineData.testsSupported.length} supported\n`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Error seeding ${machineData.name}:`, errorMessage);
    }
  }

  console.log('\n📊 Machine seeding complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Configure network settings on analyzers to match IP addresses');
  console.log('2. Ensure analyzers are on the same network as the LIS server');
  console.log('3. Test connectivity by sending a test result from each analyzer');
  console.log('4. TCP listeners will start automatically when the server runs');
  console.log('\n💡 Note: WONDFO Finecare PLUS may require USB/Serial connection');
  console.log('   If so, you may need middleware software or manual result entry\n');

  await app.close();
}

seedMachines()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding machines:', error);
    process.exit(1);
  });
