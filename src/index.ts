import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { loadEnv, appConfigSchema, type ProphecyRecord } from './config/schema.js';
import { Aggregator } from './oracle/aggregator.js';
import { WhatsAppMessenger } from './delivery/whatsapp.js';
import { createScheduler, formatNextRun, type ScheduledJob } from './scheduler/cron.js';
import { readFileSync, existsSync } from 'fs';

// Load environment and config
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
const messenger = new WhatsAppMessenger(env);

// Simple in-memory state (would use SQLite in production)
let lastProphecy: ProphecyRecord | null = null;

// Monday: Week preview (calendar + upcoming tasks)
async function deliverPreview(): Promise<ProphecyRecord> {
  console.log('\n═══════════════════════════════════════');
  console.log('  🔮 SIBYL AWAKENS — WEEK PREVIEW');
  console.log('═══════════════════════════════════════\n');

  const record: ProphecyRecord = {
    id: crypto.randomUUID(),
    message: '',
    sentAt: new Date(),
    deliveryStatus: 'pending',
    eventsCount: 0,
    tasksCount: 0,
    type: 'preview',
  };

  try {
    const { message, data } = await aggregator.generatePreview();
    record.message = message;
    record.eventsCount = data.events.length;
    record.tasksCount = data.tasks.length;

    console.log('\n📜 Generated Preview:');
    console.log('─'.repeat(40));
    console.log(message);
    console.log('─'.repeat(40) + '\n');

    const delivery = await messenger.send(message);

    if (delivery.success) {
      record.deliveryStatus = 'sent';
      record.twilioSid = delivery.sid;
    } else {
      record.deliveryStatus = 'failed';
      record.error = delivery.error;
    }
  } catch (error) {
    record.deliveryStatus = 'failed';
    record.error = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Preview failed:', record.error);
  }

  lastProphecy = record;
  console.log(`\n  Status: ${record.deliveryStatus.toUpperCase()}\n`);

  return record;
}

// Friday: Week summary (completed tasks only)
async function deliverSummary(): Promise<ProphecyRecord> {
  console.log('\n═══════════════════════════════════════');
  console.log('  🔮 SIBYL AWAKENS — WEEK SUMMARY');
  console.log('═══════════════════════════════════════\n');

  const record: ProphecyRecord = {
    id: crypto.randomUUID(),
    message: '',
    sentAt: new Date(),
    deliveryStatus: 'pending',
    eventsCount: 0,
    tasksCount: 0,
    type: 'summary',
  };

  try {
    const { message, data } = await aggregator.generateSummary();
    record.message = message;
    record.tasksCount = data.completedTasks.length;

    console.log('\n📜 Generated Summary:');
    console.log('─'.repeat(40));
    console.log(message);
    console.log('─'.repeat(40) + '\n');

    const delivery = await messenger.send(message);

    if (delivery.success) {
      record.deliveryStatus = 'sent';
      record.twilioSid = delivery.sid;
    } else {
      record.deliveryStatus = 'failed';
      record.error = delivery.error;
    }
  } catch (error) {
    record.deliveryStatus = 'failed';
    record.error = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Summary failed:', record.error);
  }

  lastProphecy = record;
  console.log(`\n  Status: ${record.deliveryStatus.toUpperCase()}\n`);

  return record;
}

// Legacy function for backward compatibility
async function deliverProphecy(): Promise<ProphecyRecord> {
  return deliverPreview();
}

// Set up dual schedulers
// Monday 12:00 - Week preview
const mondayScheduler = createScheduler(
  { ...env, CRON_SCHEDULE: '0 12 * * 1' }, // Monday at 12:00
  deliverPreview
);

// Friday 17:00 - Week summary
const fridayScheduler = createScheduler(
  { ...env, CRON_SCHEDULE: '0 17 * * 5' }, // Friday at 17:00
  deliverSummary
);

// Keep reference to old scheduler for backward compatibility
const scheduler = mondayScheduler;

// Create Hono app
const app = new Hono();

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Status endpoint
app.get('/status', (c) => {
  const nextMonday = mondayScheduler.nextRun();
  const nextFriday = fridayScheduler.nextRun();
  
  return c.json({
    oracle: 'listening',
    schedules: {
      monday: {
        type: 'preview',
        description: 'Week preview (calendar + tasks)',
        cron: '0 12 * * 1',
        timezone: env.CRON_TIMEZONE,
        nextRun: nextMonday ? formatNextRun(nextMonday) : null,
      },
      friday: {
        type: 'summary',
        description: 'Week summary (completed tasks)',
        cron: '0 17 * * 5',
        timezone: env.CRON_TIMEZONE,
        nextRun: nextFriday ? formatNextRun(nextFriday) : null,
      },
    },
    lastProphecy: lastProphecy
      ? {
          type: lastProphecy.type,
          sentAt: lastProphecy.sentAt,
          status: lastProphecy.deliveryStatus,
          eventsCount: lastProphecy.eventsCount,
          tasksCount: lastProphecy.tasksCount,
          preview: lastProphecy.message.slice(0, 100) + '...',
        }
      : null,
    config: {
      todoist: appConfig.todoist,
      calendar: appConfig.calendar,
    },
  });
});

// Manual trigger (authenticated)
// POST /trigger?type=preview (default) or POST /trigger?type=summary
app.post('/trigger', async (c) => {
  const authHeader = c.req.header('Authorization');
  const expectedAuth = `Bearer ${env.API_SECRET}`;

  if (authHeader !== expectedAuth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const type = c.req.query('type') || 'preview';
  
  console.log(`🔑 Manual trigger authorized (type: ${type})`);
  
  let record: ProphecyRecord;
  if (type === 'summary') {
    record = await deliverSummary();
  } else {
    record = await deliverPreview();
  }

  return c.json({
    success: record.deliveryStatus === 'sent',
    prophecy: {
      id: record.id,
      type: record.type,
      message: record.message,
      sentAt: record.sentAt,
      status: record.deliveryStatus,
      error: record.error,
    },
  });
});

// Preview (dry run, no send)
// GET /preview?type=preview (default) or GET /preview?type=summary
app.get('/preview', async (c) => {
  const authHeader = c.req.header('Authorization');
  const expectedAuth = `Bearer ${env.API_SECRET}`;

  if (authHeader !== expectedAuth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const type = c.req.query('type') || 'preview';
  console.log(`👁️ Preview requested (type: ${type})`);
  
  try {
    if (type === 'summary') {
      const { message, data } = await aggregator.generateSummary();
      return c.json({
        type: 'summary',
        message,
        data: {
          completedTasksCount: data.completedTasks.length,
          completedTasks: data.completedTasks.map(t => ({
            content: t.content,
            completedAt: t.completedAt,
            project: t.projectName,
          })),
        },
      });
    } else {
      const { message, data } = await aggregator.generatePreview();
      return c.json({
        type: 'preview',
        message,
        data: {
          eventsCount: data.events.length,
          tasksCount: data.tasks.length,
          events: data.events.map(e => ({
            summary: e.summary,
            start: e.start,
            isAllDay: e.isAllDay,
          })),
          tasks: data.tasks.map(t => ({
            content: t.content,
            due: t.due,
            priority: t.priority,
            project: t.projectName,
          })),
        },
      });
    }
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Start server
const port = env.PORT;

console.log(`
╔═══════════════════════════════════════╗
║                                       ║
║     ╱│╲                               ║
║    ╱ │ ╲                              ║
║   ╱  │  ╲      S I B Y L              ║
║  ╱   ◯   ╲                            ║
║ ╱────┴────╲    Oracle Awakening...    ║
║╱           ╲                          ║
║──────────────                         ║
║                                       ║
╚═══════════════════════════════════════╝
`);

// Start both schedulers
mondayScheduler.start();
fridayScheduler.start();

console.log(`🌐 Server running on http://localhost:${port}`);
console.log('\n📆 Schedules:');
console.log(`   Monday  12:00 — Week preview (calendar + tasks)`);
console.log(`   Friday  17:00 — Week summary (completed tasks)`);
console.log(`\n   Next preview: ${formatNextRun(mondayScheduler.nextRun())}`);
console.log(`   Next summary: ${formatNextRun(fridayScheduler.nextRun())}`);
console.log('\nEndpoints:');
console.log(`   GET  /health          - Health check`);
console.log(`   GET  /status          - Current status and config`);
console.log(`   POST /trigger?type=   - Manual trigger (preview|summary)`);
console.log(`   GET  /preview?type=   - Preview message (preview|summary)`);

serve({
  fetch: app.fetch,
  port,
});

