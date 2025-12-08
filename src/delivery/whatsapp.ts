import twilio from 'twilio';
import type { EnvConfig } from '../config/schema.js';

export interface DeliveryResult {
  success: boolean;
  sid?: string;
  error?: string;
}

export class WhatsAppMessenger {
  private client: twilio.Twilio;
  private fromNumber: string;
  private toNumber: string;

  constructor(env: EnvConfig) {
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    this.fromNumber = env.TWILIO_WHATSAPP_FROM;
    this.toNumber = env.RECIPIENT_WHATSAPP;
  }

  async send(message: string): Promise<DeliveryResult> {
    console.log('📱 Sending WhatsApp message...');
    console.log(`   From: ${this.fromNumber}`);
    console.log(`   To: ${this.toNumber}`);
    console.log(`   Length: ${message.length} characters`);

    try {
      const result = await this.client.messages.create({
        from: this.fromNumber,
        to: this.toNumber,
        body: message,
      });

      console.log(`✅ Message sent! SID: ${result.sid}`);

      return {
        success: true,
        sid: result.sid,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to send message: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

