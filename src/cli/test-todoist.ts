#!/usr/bin/env tsx
/**
 * Test Todoist integration and list projects + labels
 */

import { readFileSync, existsSync } from 'fs';

// Load .env
function loadDotEnv() {
  const envPath = '.env';
  if (!existsSync(envPath)) return;
  
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

const token = process.env.TODOIST_API_TOKEN;

if (!token) {
  console.error('❌ TODOIST_API_TOKEN not set');
  process.exit(1);
}

interface Project {
  id: string;
  name: string;
  is_inbox_project: boolean;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Task {
  id: string;
  content: string;
  due?: { date: string; datetime?: string };
  priority: number;
  project_id: string;
  labels: string[];
}

async function main() {
  console.log('\n✅ Todoist Connection Test\n');

  // Fetch projects
  const projectsRes = await fetch('https://api.todoist.com/rest/v2/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const projects: Project[] = await projectsRes.json();
  
  // Fetch labels
  const labelsRes = await fetch('https://api.todoist.com/rest/v2/labels', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const labels: Label[] = await labelsRes.json();

  // Fetch tasks
  const tasksRes = await fetch('https://api.todoist.com/rest/v2/tasks', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tasks: Task[] = await tasksRes.json();

  console.log('📁 Your Projects:\n');
  for (const project of projects) {
    const inbox = project.is_inbox_project ? ' (Inbox)' : '';
    console.log(`   • ${project.name}${inbox}`);
  }

  console.log('\n🏷️  Your Labels:\n');
  if (labels.length === 0) {
    console.log('   (no labels found)');
  } else {
    for (const label of labels) {
      // Count tasks with this label
      const count = tasks.filter(t => t.labels.includes(label.name)).length;
      console.log(`   • ${label.name} (${count} tasks)`);
    }
  }

  // Show tasks with labels
  const tasksWithLabels = tasks.filter(t => t.labels.length > 0);
  if (tasksWithLabels.length > 0) {
    console.log('\n📋 Tasks with labels:\n');
    const projectMap = new Map(projects.map(p => [p.id, p.name]));
    for (const task of tasksWithLabels) {
      console.log(`   • "${task.content}"`);
      console.log(`     Labels: ${task.labels.join(', ')}`);
      console.log(`     Project: ${projectMap.get(task.project_id)}`);
    }
  }

  console.log('\n💡 To filter by label, update config.json:');
  console.log('   "include_labels": ["label-name"]');
}

main();
