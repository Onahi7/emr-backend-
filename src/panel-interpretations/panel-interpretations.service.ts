import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PanelInterpretation } from '../database/schemas/panel-interpretation.schema';
import { CreatePanelInterpretationDto } from './dto/create-panel-interpretation.dto';
import { UpdatePanelInterpretationDto } from './dto/update-panel-interpretation.dto';

@Injectable()
export class PanelInterpretationsService {
  constructor(
    @InjectModel(PanelInterpretation.name)
    private panelInterpretationModel: Model<PanelInterpretation>,
  ) {}

  /**
   * Create or update panel interpretation
   * Uses upsert to avoid duplicates
   */
  async upsert(
    createDto: CreatePanelInterpretationDto,
    userId?: string,
  ): Promise<PanelInterpretation> {
    // Handle aiGeneratedAt conversion from string to Date
    const updateData: any = {
      ...createDto,
      enteredBy: userId,
      enteredAt: new Date(),
    };
    
    if (createDto.aiGeneratedAt) {
      updateData.aiGeneratedAt = new Date(createDto.aiGeneratedAt);
    }

    const interpretation = await this.panelInterpretationModel.findOneAndUpdate(
      {
        orderId: createDto.orderId,
        panelCode: createDto.panelCode,
      },
      updateData,
      {
        upsert: true,
        new: true,
      },
    );

    return interpretation;
  }

  /**
   * Get all interpretations for an order
   */
  async findByOrder(orderId: string): Promise<PanelInterpretation[]> {
    return this.panelInterpretationModel
      .find({ orderId })
      .populate('enteredBy', 'firstName lastName')
      .exec();
  }

  /**
   * Get interpretation for a specific panel in an order
   */
  async findOne(orderId: string, panelCode: string): Promise<PanelInterpretation | null> {
    return this.panelInterpretationModel
      .findOne({ orderId, panelCode })
      .populate('enteredBy', 'firstName lastName')
      .exec();
  }

  /**
   * Update panel interpretation
   */
  async update(
    orderId: string,
    panelCode: string,
    updateDto: UpdatePanelInterpretationDto,
    userId?: string,
  ): Promise<PanelInterpretation> {
    const interpretation = await this.panelInterpretationModel.findOneAndUpdate(
      { orderId, panelCode },
      {
        ...updateDto,
        enteredBy: userId,
        enteredAt: new Date(),
      },
      { new: true },
    );

    if (!interpretation) {
      throw new NotFoundException(
        `Panel interpretation not found for order ${orderId} and panel ${panelCode}`,
      );
    }

    return interpretation;
  }

  /**
   * Delete panel interpretation
   */
  async remove(orderId: string, panelCode: string): Promise<void> {
    const result = await this.panelInterpretationModel.deleteOne({
      orderId,
      panelCode,
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException(
        `Panel interpretation not found for order ${orderId} and panel ${panelCode}`,
      );
    }
  }
}
