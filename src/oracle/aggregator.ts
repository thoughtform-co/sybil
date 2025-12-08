import type { OracleData, AppConfig, EnvConfig, CompletedTask } from '../config/schema.js';
import { GoogleCalendarSource, formatEventsForPrompt } from '../sources/calendar.js';
import { TodoistSource, formatTasksForPrompt, formatCompletedTasksForPrompt } from '../sources/todoist.js';
import { OracleGenerator, ProphecyType } from './generator.js';

export interface PreviewData {
  type: 'preview';
  events: OracleData['events'];
  tasks: OracleData['tasks'];
  generatedAt: Date;
}

export interface SummaryData {
  type: 'summary';
  completedTasks: CompletedTask[];
  generatedAt: Date;
}

export class Aggregator {
  private calendarSource: GoogleCalendarSource;
  private todoistSource: TodoistSource;
  private generator: OracleGenerator;

  constructor(env: EnvConfig, config: AppConfig) {
    this.calendarSource = new GoogleCalendarSource(env, config.calendar);
    this.todoistSource = new TodoistSource(env, config.todoist);
    this.generator = new OracleGenerator(env);
  }

  // Monday: Gather calendar events + upcoming tasks
  async gatherPreviewData(): Promise<PreviewData> {
    console.log('📅 Fetching calendar events...');
    const events = await this.calendarSource.fetchEvents();
    console.log(`   Found ${events.length} events`);

    console.log('✅ Fetching upcoming tasks...');
    const tasks = await this.todoistSource.fetchTasks();
    console.log(`   Found ${tasks.length} tasks`);

    return {
      type: 'preview',
      events,
      tasks,
      generatedAt: new Date(),
    };
  }

  // Friday: Gather completed tasks from the week
  async gatherSummaryData(): Promise<SummaryData> {
    console.log('✅ Fetching completed tasks from this week...');
    const completedTasks = await this.todoistSource.fetchCompletedTasks(7);
    console.log(`   Found ${completedTasks.length} completed tasks`);

    return {
      type: 'summary',
      completedTasks,
      generatedAt: new Date(),
    };
  }

  // Monday: Week preview prophecy
  async generatePreview(): Promise<{ message: string; data: PreviewData }> {
    const data = await this.gatherPreviewData();

    const calendarFormatted = formatEventsForPrompt(data.events);
    const tasksFormatted = formatTasksForPrompt(data.tasks);

    console.log('\n--- Calendar Data for Oracle ---');
    console.log(calendarFormatted);
    console.log('\n--- Tasks Data for Oracle ---');
    console.log(tasksFormatted);
    console.log('--------------------------------\n');

    const message = await this.generator.generatePreview(
      calendarFormatted,
      tasksFormatted
    );

    return { message, data };
  }

  // Friday: Week summary prophecy
  async generateSummary(): Promise<{ message: string; data: SummaryData }> {
    const data = await this.gatherSummaryData();

    const completedFormatted = formatCompletedTasksForPrompt(data.completedTasks);

    console.log('\n--- Completed Tasks for Oracle ---');
    console.log(completedFormatted);
    console.log('----------------------------------\n');

    const message = await this.generator.generateSummary(completedFormatted);

    return { message, data };
  }

  // Legacy method for backward compatibility
  async gatherData(): Promise<OracleData> {
    const preview = await this.gatherPreviewData();
    return {
      events: preview.events,
      tasks: preview.tasks,
      generatedAt: preview.generatedAt,
      periodStart: preview.generatedAt,
      periodEnd: new Date(preview.generatedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  async generateProphecy(): Promise<{ message: string; data: OracleData }> {
    const { message, data } = await this.generatePreview();
    return {
      message,
      data: {
        events: data.events,
        tasks: data.tasks,
        generatedAt: data.generatedAt,
        periodStart: data.generatedAt,
        periodEnd: new Date(data.generatedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    };
  }
}

