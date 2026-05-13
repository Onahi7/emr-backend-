import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './settings.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name)
    private settingsModel: Model<SettingsDocument>,
  ) {}

  async getSetting(key: string): Promise<any> {
    const setting = await this.settingsModel.findOne({ key }).exec();
    if (!setting) {
      return null;
    }
    return {
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedAt: (setting as any).updatedAt,
    };
  }

  async getAllSettings(): Promise<any[]> {
    const settings = await this.settingsModel.find().exec();
    return settings.map((setting) => ({
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedAt: (setting as any).updatedAt,
    }));
  }

  async updateSetting(
    key: string,
    value: any,
    updatedBy?: string,
    description?: string,
  ): Promise<any> {
    const setting = await this.settingsModel
      .findOneAndUpdate(
        { key },
        {
          key,
          value,
          description,
          updatedBy,
        },
        { upsert: true, new: true },
      )
      .exec();

    return {
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedAt: (setting as any).updatedAt,
    };
  }

  async deleteSetting(key: string): Promise<void> {
    await this.settingsModel.deleteOne({ key }).exec();
  }
}
