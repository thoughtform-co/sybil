import { google } from 'googleapis';
import type { CalendarEvent, CalendarConfig, EnvConfig } from '../config/schema.js';

export class GoogleCalendarSource {
  private calendar;
  private config: CalendarConfig;

  constructor(env: EnvConfig, config: CalendarConfig) {
    this.config = config;

    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
    });

    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async fetchEvents(): Promise<CalendarEvent[]> {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + this.config.days_ahead);

    const allEvents: CalendarEvent[] = [];

    // Fetch from each included calendar
    const calendarsToFetch = this.config.include_calendars.length > 0
      ? this.config.include_calendars
      : ['primary'];

    for (const calendarId of calendarsToFetch) {
      // Skip excluded calendars
      if (this.config.exclude_calendars.includes(calendarId)) {
        continue;
      }

      try {
        const response = await this.calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50,
        });

        const events = response.data.items || [];

        for (const event of events) {
          if (!event.id || !event.summary) continue;

          const isAllDay = !event.start?.dateTime;
          const startStr = event.start?.dateTime || event.start?.date;
          const endStr = event.end?.dateTime || event.end?.date;

          if (!startStr || !endStr) continue;

          allEvents.push({
            id: event.id,
            summary: event.summary,
            start: new Date(startStr),
            end: new Date(endStr),
            location: event.location || undefined,
            description: event.description || undefined,
            isAllDay,
          });
        }
      } catch (error) {
        console.error(`Failed to fetch calendar "${calendarId}":`, error);
        // Continue with other calendars
      }
    }

    // Sort by start time
    allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    return allEvents;
  }
}

// Format events for the oracle prompt
export function formatEventsForPrompt(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return 'No calendar events this week.';
  }

  const lines: string[] = [];
  let currentDate = '';

  for (const event of events) {
    const dateStr = event.start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    // Add date header if new day
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      lines.push(`\n${dateStr}:`);
    }

    if (event.isAllDay) {
      lines.push(`  - [All day] ${event.summary}`);
    } else {
      const timeStr = event.start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const endTimeStr = event.end.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      lines.push(`  - ${timeStr}-${endTimeStr}: ${event.summary}`);
    }

    if (event.location) {
      lines.push(`    Location: ${event.location}`);
    }
  }

  return lines.join('\n').trim();
}

