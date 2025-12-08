import { z } from 'zod';

// Environment variable schema
export const envSchema = z.object({
  // Google Calendar
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),

  // Todoist
  TODOIST_API_TOKEN: z.string().min(1),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WHATSAPP_FROM: z.string().startsWith('whatsapp:'),
  RECIPIENT_WHATSAPP: z.string().startsWith('whatsapp:'),

  // Schedule
  CRON_SCHEDULE: z.string().default('0 18 * * 0'),
  CRON_TIMEZONE: z.string().default('Europe/Brussels'),

  // Server
  PORT: z.string().default('3000').transform(Number),
  API_SECRET: z.string().min(1),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Todoist filter configuration
export const todoistConfigSchema = z.object({
  include_projects: z.array(z.string()).default([]),
  exclude_projects: z.array(z.string()).default([]),
  min_priority: z.number().min(1).max(4).default(2),
  include_labels: z.array(z.string()).default([]),
  include_overdue: z.boolean().default(true),
});

export type TodoistConfig = z.infer<typeof todoistConfigSchema>;

// Calendar filter configuration
export const calendarConfigSchema = z.object({
  include_calendars: z.array(z.string()).default(['primary']),
  exclude_calendars: z.array(z.string()).default([]),
  days_ahead: z.number().min(1).max(30).default(7),
});

export type CalendarConfig = z.infer<typeof calendarConfigSchema>;

// Full application config
export const appConfigSchema = z.object({
  todoist: todoistConfigSchema.default({}),
  calendar: calendarConfigSchema.default({}),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// Data types for calendar events
export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  isAllDay: boolean;
}

// Data types for Todoist tasks
export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  due?: Date;
  priority: number; // 1-4, where 1 is highest (P1)
  projectName?: string;
  labels: string[];
  isOverdue: boolean;
}

// Aggregated data for the oracle
export interface OracleData {
  events: CalendarEvent[];
  tasks: TodoistTask[];
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
}

// Message record for logging
export interface ProphecyRecord {
  id: string;
  message: string;
  sentAt: Date;
  deliveryStatus: 'sent' | 'failed' | 'pending';
  eventsCount: number;
  tasksCount: number;
  twilioSid?: string;
  error?: string;
  type: 'preview' | 'summary';
}

// Completed task from Todoist
export interface CompletedTask {
  id: string;
  content: string;
  completedAt: Date;
  projectName?: string;
}

// Validate and load env
export function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  
  return result.data;
}

