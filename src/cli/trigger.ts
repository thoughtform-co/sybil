#!/usr/bin/env tsx
/**
 * CLI script to manually trigger a prophecy
 * Usage: npm run trigger
 */

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

import { loadEnv, appConfigSchema } from '../config/schema.js';
import { Aggregator } from '../oracle/aggregator.js';
import { WhatsAppMessenger } from '../delivery/whatsapp.js';
import { readFileSync, existsSync } from 'fs';

async function main() {
  console.log('\n🔮 Sibyl Manual Trigger\n');

  // Check flags
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
  const isSummary = process.argv.includes('--summary') || process.argv.includes('-s');
  const messageType = isSummary ? 'summary' : 'preview';
  
  if (isDryRun) {
    console.log('📋 DRY RUN MODE - Message will not be sent\n');
  }
  
  console.log(`📨 Message type: ${messageType.toUpperCase()}\n`);

  // Load environment
  const env = loadEnv();

  // Load optional config file
  let appConfig = appConfigSchema.parse({});
  const configPath = './config.json';
  if (existsSync(configPath)) {
    try {
      const configFile = readFileSync(configPath, 'utf-8');
      appConfig = appConfigSchema.parse(JSON.parse(configFile));
      console.log('📁 Loaded config from config.json');
    } catch (error) {
      console.warn('⚠️ Failed to load config.json, using defaults');
    }
  }

  // Initialize components
  const aggregator = new Aggregator(env, appConfig);

  try {
    let message: string;
    let stats: string;

    if (messageType === 'summary') {
      // Friday: Week summary (completed tasks)
      const result = await aggregator.generateSummary();
      message = result.message;
      stats = `Completed tasks: ${result.data.completedTasks.length}`;
    } else {
      // Monday: Week preview (calendar + tasks)
      const result = await aggregator.generatePreview();
      message = result.message;
      stats = `Events: ${result.data.events.length}\nTasks: ${result.data.tasks.length}`;
    }

    console.log('\n═══════════════════════════════════════');
    console.log(`  📜 GENERATED ${messageType.toUpperCase()}`);
    console.log('═══════════════════════════════════════');
    console.log(`\n${stats}`);
    console.log(`\n${message}\n`);
    console.log('═══════════════════════════════════════\n');

    if (!isDryRun) {
      // Send via WhatsApp
      const messenger = new WhatsAppMessenger(env);
      const result = await messenger.send(message);

      if (result.success) {
        console.log('✅ Message delivered successfully!');
        console.log(`   Twilio SID: ${result.sid}`);
      } else {
        console.error('❌ Failed to deliver message');
        console.error(`   Error: ${result.error}`);
        process.exit(1);
      }
    } else {
      console.log('📋 Dry run complete - message not sent');
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

