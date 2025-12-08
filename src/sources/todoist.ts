import type { TodoistTask, TodoistConfig, EnvConfig, CompletedTask } from '../config/schema.js';

interface TodoistApiTask {
  id: string;
  content: string;
  description: string;
  due?: {
    date: string;
    datetime?: string;
    string: string;
    timezone?: string;
  };
  priority: number;
  project_id: string;
  labels: string[];
}

interface TodoistApiProject {
  id: string;
  name: string;
}

interface TodoistCompletedItem {
  completed_at: string;
  content: string;
  id: string;
  item_object: {
    id: string;
    content: string;
    description: string;
    labels: string[];
    project_id: string;
  } | null;
  project_id: string;
  task_id: string;
}

export class TodoistSource {
  private apiToken: string;
  private config: TodoistConfig;
  private projectCache: Map<string, string> = new Map();

  constructor(env: EnvConfig, config: TodoistConfig) {
    this.apiToken = env.TODOIST_API_TOKEN;
    this.config = config;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`https://api.todoist.com/rest/v2/${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Todoist API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async loadProjects(): Promise<void> {
    if (this.projectCache.size > 0) return;

    const projects = await this.fetch<TodoistApiProject[]>('projects');
    for (const project of projects) {
      this.projectCache.set(project.id, project.name);
    }
  }

  async fetchCompletedTasks(sinceDays: number = 7): Promise<CompletedTask[]> {
    // Load projects first for name mapping
    await this.loadProjects();

    const since = new Date();
    since.setDate(since.getDate() - sinceDays);

    // Use Sync API for completed items
    const response = await fetch(
      `https://api.todoist.com/sync/v9/completed/get_all?since=${since.toISOString()}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Todoist API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { items: TodoistCompletedItem[] };
    const completedTasks: CompletedTask[] = [];

    for (const item of data.items || []) {
      // Get labels from item_object if available
      const labels = item.item_object?.labels || [];
      
      // Apply label filter
      if (this.config.include_labels.length > 0) {
        const hasMatchingLabel = labels.some(label =>
          this.config.include_labels.includes(label)
        );
        if (!hasMatchingLabel) {
          continue;
        }
      }

      // Apply project filter
      const projectName = this.projectCache.get(item.project_id);
      
      if (this.config.include_projects.length > 0) {
        if (!projectName || !this.config.include_projects.includes(projectName)) {
          continue;
        }
      }

      if (this.config.exclude_projects.length > 0) {
        if (projectName && this.config.exclude_projects.includes(projectName)) {
          continue;
        }
      }

      completedTasks.push({
        id: item.task_id,
        content: item.content,
        completedAt: new Date(item.completed_at),
        projectName,
      });
    }

    // Sort by completion time, most recent first
    completedTasks.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

    return completedTasks;
  }

  async fetchTasks(): Promise<TodoistTask[]> {
    // Load projects first for name mapping
    await this.loadProjects();

    // Fetch all tasks
    const tasks = await this.fetch<TodoistApiTask[]>('tasks');
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 7);

    const filteredTasks: TodoistTask[] = [];

    for (const task of tasks) {
      const projectName = this.projectCache.get(task.project_id);

      // Apply project filters
      if (this.config.include_projects.length > 0) {
        if (!projectName || !this.config.include_projects.includes(projectName)) {
          continue;
        }
      }

      if (this.config.exclude_projects.length > 0) {
        if (projectName && this.config.exclude_projects.includes(projectName)) {
          continue;
        }
      }

      // Apply label filter (if configured, task must have at least one matching label)
      if (this.config.include_labels.length > 0) {
        const hasMatchingLabel = task.labels.some(label =>
          this.config.include_labels.includes(label)
        );
        if (!hasMatchingLabel) {
          continue;
        }
      }

      // Apply priority filter (Todoist: 4=P1, 3=P2, 2=P3, 1=P4)
      // Convert to logical priority (1=highest)
      const logicalPriority = 5 - task.priority;
      if (logicalPriority > this.config.min_priority) {
        continue;
      }

      // Parse due date
      let dueDate: Date | undefined;
      let isOverdue = false;

      if (task.due) {
        const dueDateStr = task.due.datetime || task.due.date;
        dueDate = new Date(dueDateStr);

        // Check if overdue
        isOverdue = dueDate < now;

        // Apply date filter
        if (!isOverdue && dueDate > endDate) {
          continue;
        }

        // Skip overdue if not configured to include
        if (isOverdue && !this.config.include_overdue) {
          continue;
        }
      } else {
        // No due date - skip (we only want time-bound tasks)
        continue;
      }

      filteredTasks.push({
        id: task.id,
        content: task.content,
        description: task.description || undefined,
        due: dueDate,
        priority: logicalPriority,
        projectName,
        labels: task.labels,
        isOverdue,
      });
    }

    // Sort by due date, overdue first
    filteredTasks.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.due && b.due) return a.due.getTime() - b.due.getTime();
      return 0;
    });

    return filteredTasks;
  }
}

// Format tasks for the oracle prompt
export function formatTasksForPrompt(tasks: TodoistTask[]): string {
  if (tasks.length === 0) {
    return 'No relevant tasks this week.';
  }

  const lines: string[] = [];
  const overdue: TodoistTask[] = [];
  const upcoming: TodoistTask[] = [];

  for (const task of tasks) {
    if (task.isOverdue) {
      overdue.push(task);
    } else {
      upcoming.push(task);
    }
  }

  if (overdue.length > 0) {
    lines.push('OVERDUE:');
    for (const task of overdue) {
      const priorityLabel = task.priority === 1 ? '[P1]' : task.priority === 2 ? '[P2]' : '';
      const projectLabel = task.projectName ? `(${task.projectName})` : '';
      lines.push(`  - ${priorityLabel} ${task.content} ${projectLabel}`.trim());
      // Include description if present
      if (task.description) {
        lines.push(`      Details: ${task.description}`);
      }
    }
    lines.push('');
  }

  if (upcoming.length > 0) {
    lines.push('UPCOMING:');
    let currentDate = '';

    for (const task of upcoming) {
      const dateStr = task.due?.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }) || 'No date';

      if (dateStr !== currentDate) {
        currentDate = dateStr;
        lines.push(`\n  ${dateStr}:`);
      }

      const priorityLabel = task.priority === 1 ? '[P1]' : task.priority === 2 ? '[P2]' : '';
      const projectLabel = task.projectName ? `(${task.projectName})` : '';
      lines.push(`    - ${priorityLabel} ${task.content} ${projectLabel}`.trim());
      // Include description if present
      if (task.description) {
        lines.push(`        Details: ${task.description}`);
      }
    }
  }

  return lines.join('\n').trim();
}

// Format completed tasks for the Friday summary
export function formatCompletedTasksForPrompt(tasks: CompletedTask[]): string {
  if (tasks.length === 0) {
    return 'No tasks were completed this week.';
  }

  const lines: string[] = [];
  lines.push(`COMPLETED THIS WEEK (${tasks.length} tasks):`);

  for (const task of tasks) {
    const dateStr = task.completedAt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    lines.push(`  ✓ ${task.content} (completed ${dateStr})`);
  }

  return lines.join('\n');
}

