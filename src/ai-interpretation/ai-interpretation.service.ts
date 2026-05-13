import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PanelInterpretationsService } from '../panel-interpretations/panel-interpretations.service';

export interface ResultItem {
  testCode: string;
  testName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';
}

export interface PanelResults {
  panelCode: string;
  panelName: string;
  results: ResultItem[];
}

export type AiProvider = 'groq' | 'openai' | 'openrouter';

@Injectable()
export class AiInterpretationService implements OnModuleInit {
  private readonly logger = new Logger(AiInterpretationService.name);
  private groqApiKey: string;
  private openAiApiKey: string;
  private openRouterApiKey: string;
  private defaultProvider: AiProvider = 'openrouter';

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private panelInterpretationsService: PanelInterpretationsService,
  ) {}

  onModuleInit() {
    this.groqApiKey = this.configService.get<string>('GROQ_API_KEY') || '';
    this.openAiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.openRouterApiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    
    // Priority: OpenRouter (free) > Groq > OpenAI
    if (this.openRouterApiKey) {
      this.defaultProvider = 'openrouter';
      this.logger.log('✅ Using OpenRouter (free) for AI interpretations');
    } else if (this.groqApiKey) {
      this.defaultProvider = 'groq';
      this.logger.log('✅ Using Groq for AI interpretations');
    } else if (this.openAiApiKey) {
      this.defaultProvider = 'openai';
      this.logger.log('✅ Using OpenAI for AI interpretations');
    } else {
      this.logger.warn('⚠️ No AI API keys configured. AI interpretation will not work.');
      this.logger.warn('Set OPENROUTER_API_KEY (recommended - free), GROQ_API_KEY, or OPENAI_API_KEY');
    }
  }

  /**
   * Generate AI interpretation for a panel's results
   */
  async generateInterpretation(
    orderId: string,
    panelResults: PanelResults,
  ): Promise<string> {
    const prompt = this.buildPrompt(panelResults);

    try {
      let interpretation: string;

      // Try providers in order of preference
      if (this.openRouterApiKey) {
        interpretation = await this.callOpenRouter(prompt);
      } else if (this.groqApiKey) {
        interpretation = await this.callGroq(prompt);
      } else if (this.openAiApiKey) {
        interpretation = await this.callOpenAI(prompt);
      } else {
        throw new Error('No AI API key configured');
      }

      // Save the interpretation to the database
      await this.panelInterpretationsService.upsert(
        {
          orderId,
          panelCode: panelResults.panelCode,
          panelName: panelResults.panelName,
          interpretation,
          aiProvider: this.defaultProvider,
          aiGeneratedAt: new Date().toISOString(),
        },
        undefined,
      );

      return interpretation;
    } catch (error) {
      this.logger.error(`Failed to generate interpretation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build clinical prompt for the AI
   */
  private buildPrompt(panelResults: PanelResults): string {
    const resultsList = panelResults.results
      .map((r) => {
        const flagEmoji = r.flag === 'high' || r.flag === 'critical_high' 
          ? '↑' 
          : r.flag === 'low' || r.flag === 'critical_low' 
            ? '↓' 
            : '✓';
        return `- ${r.testName} (${r.testCode}): ${r.value} ${r.unit || ''} [${r.referenceRange || 'N/A'}] ${flagEmoji}`;
      })
      .join('\n');

    return `You are a clinical laboratory doctor. Provide a brief clinical interpretation for the ${panelResults.panelName} (${panelResults.panelCode}) panel based on these results:

${resultsList}

Consider:
- Which values are abnormal (HIGH/LOW/CRITICAL)
- Possible clinical significance of abnormal results
- Correlation between related tests if applicable

Format: 2-4 sentence clinical summary. If all values are normal, state "All values within normal limits." Be concise and clinically relevant. Do not repeat the raw values in your interpretation.`;
  }

  /**
   * Call Groq API (free tier available)
   */
  private async callGroq(prompt: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant', // Free model
          messages: [
            {
              role: 'system',
              content: 'You are a clinical laboratory doctor providing concise, accurate medical interpretations of lab results.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${this.groqApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Call OpenAI API (fallback)
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a clinical laboratory doctor providing concise, accurate medical interpretations of lab results.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openAiApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Call OpenRouter API (free models available)
   * Supports gpt-oss-120b and other free models
   */
  private async callOpenRouter(prompt: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          // Use gpt-oss-120b (free model)
          model: 'openai/gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: 'You are a clinical laboratory doctor providing concise, accurate medical interpretations of lab results.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://your-lab.com',
            'X-Title': 'Lab LIS AI Interpretation',
          },
        },
      ),
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Check if AI is configured and available
   */
  isConfigured(): boolean {
    return !!(this.openRouterApiKey || this.groqApiKey || this.openAiApiKey);
  }

  /**
   * Get the current provider name
   */
  getProviderName(): string {
    return this.defaultProvider;
  }
}