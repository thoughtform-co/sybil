import cron from 'node-cron';
import type { EnvConfig } from '../config/schema.js';

export interface ScheduledJob {
  start: () => void;
  stop: () => void;
  nextRun: () => Date | null;
}

export function createScheduler(
  env: EnvConfig,
  onTrigger: () => Promise<unknown>
): ScheduledJob {
  const cronExpression = env.CRON_SCHEDULE;
  const timezone = env.CRON_TIMEZONE;

  console.log(`📆 Scheduler configured: "${cronExpression}" (${timezone})`);

  // Validate cron expression
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const task = cron.schedule(
    cronExpression,
    async () => {
      console.log('\n⏰ Scheduled trigger fired!');
      console.log(`   Time: ${new Date().toISOString()}`);
      try {
        await onTrigger();
      } catch (error) {
        console.error('❌ Scheduled job failed:', error);
      }
    },
    {
      timezone,
      scheduled: false, // Don't start automatically
    }
  );

  return {
    start: () => {
      task.start();
      console.log('✅ Scheduler started');
    },
    stop: () => {
      task.stop();
      console.log('🛑 Scheduler stopped');
    },
    nextRun: () => {
      // Calculate next run time based on cron expression
      // This is a simplified calculation
      const parts = cronExpression.split(' ');
      if (parts.length >= 5) {
        const [minute, hour, , , dayOfWeek] = parts;
        const now = new Date();
        const next = new Date();
        
        // Set the time
        if (hour !== '*') next.setHours(parseInt(hour));
        if (minute !== '*') next.setMinutes(parseInt(minute));
        next.setSeconds(0);
        next.setMilliseconds(0);
        
        // Find next matching day of week
        if (dayOfWeek !== '*') {
          const targetDay = parseInt(dayOfWeek);
          const currentDay = now.getDay();
          let daysUntil = targetDay - currentDay;
          if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
            daysUntil += 7;
          }
          next.setDate(now.getDate() + daysUntil);
        } else if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        
        return next;
      }
      return null;
    },
  };
}

export function formatNextRun(date: Date | null): string {
  if (!date) return 'Unknown';
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

