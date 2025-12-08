import Anthropic from '@anthropic-ai/sdk';
import type { EnvConfig } from '../config/schema.js';
import {
  MONDAY_PREVIEW_SYSTEM_PROMPT,
  FRIDAY_SUMMARY_SYSTEM_PROMPT,
  buildMondayPreviewPrompt,
  buildFridaySummaryPrompt,
} from './prompts.js';

export type ProphecyType = 'preview' | 'summary';

export class OracleGenerator {
  private client: Anthropic;

  constructor(env: EnvConfig) {
    this.client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  private async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    console.log('🔮 Consulting the oracle...');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from oracle');
    }

    const message = textBlock.text.trim();

    // Validate message length for WhatsApp
    if (message.length > 1600) {
      console.warn('⚠️ Message exceeds WhatsApp limit, truncating...');
      return message.slice(0, 1597) + '...';
    }

    return message;
  }

  // Monday: Week preview with calendar + upcoming tasks
  async generatePreview(calendarData: string, tasksData: string): Promise<string> {
    const userPrompt = buildMondayPreviewPrompt(calendarData, tasksData);
    return this.generate(MONDAY_PREVIEW_SYSTEM_PROMPT, userPrompt);
  }

  // Friday: Week summary with completed tasks only
  async generateSummary(completedTasksData: string): Promise<string> {
    const userPrompt = buildFridaySummaryPrompt(completedTasksData);
    return this.generate(FRIDAY_SUMMARY_SYSTEM_PROMPT, userPrompt);
  }

  // Legacy method for backward compatibility
  async generateMessage(calendarData: string, tasksData: string): Promise<string> {
    return this.generatePreview(calendarData, tasksData);
  }
}

