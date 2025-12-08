#!/usr/bin/env tsx
/**
 * Quick test script to verify WhatsApp integration
 * Usage: npx tsx src/cli/test-whatsapp.ts
 */

import twilio from 'twilio';
import { readFileSync, existsSync } from 'fs';

// Load .env file manually
function loadDotEnv() {
  const envPath = '.env';
  if (!existsSync(envPath)) {
    console.warn('⚠️ No .env file found');
    return;
  }
  
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

// Read just the Twilio vars we need
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const to = process.env.RECIPIENT_WHATSAPP;

async function main() {
  console.log('\n🔮 Sibyl WhatsApp Test\n');

  // Validate
  if (!accountSid || !authToken || !to) {
    console.error('❌ Missing required env vars:');
    if (!accountSid) console.error('   - TWILIO_ACCOUNT_SID');
    if (!authToken) console.error('   - TWILIO_AUTH_TOKEN');
    if (!to) console.error('   - RECIPIENT_WHATSAPP');
    console.error('\nMake sure your .env file exists and has these values.');
    process.exit(1);
  }

  console.log(`From: ${from}`);
  console.log(`To: ${to}`);
  console.log('');

  const client = twilio(accountSid, authToken);

  const testMessage = `The oracle stirs...

This is a test message from Sibyl. If you're reading this, the WhatsApp integration is working.`;

  try {
    const result = await client.messages.create({
      from,
      to,
      body: testMessage,
    });

    console.log('✅ Success! Check your WhatsApp.');
    console.log(`   Message SID: ${result.sid}`);
  } catch (error) {
    console.error('❌ Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
