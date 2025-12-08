# SIBYL

> *She sits where your intentions gather and gives them voice before they're lost to silence.*

```
     ╱│╲
    ╱ │ ╲
   ╱  │  ╲
  ╱   ◯   ╲
 ╱────┴────╲
╱           ╲
──────────────
   S I B Y L
```

**Sibyl** is an oracle for the domestic mundane—a herald that scries calendars and task lists, then carries word through the veil to those who need to know.

## What Sibyl Does

1. **Reads** Google Calendar events and filtered Todoist tasks
2. **Synthesizes** them into a concise, human message in your voice
3. **Delivers** via WhatsApp on a scheduled cadence

## What Sibyl Doesn't Do

- Manage tasks or calendars (read-only oracle)
- Respond to messages (one-way herald)
- Replace communication (augment it)

---

## Quick Start

### Prerequisites

- Node.js 18+ or Bun
- Google Cloud project with Calendar API enabled
- Todoist account with API token
- Anthropic API key
- Twilio account with WhatsApp sandbox or approved sender

### Installation

```bash
# Clone and install
cd sibyl
npm install

# Copy environment template
cp .env.example .env

# Fill in your credentials (see Configuration below)
```

### Configuration

Create a `.env` file with the following:

```bash
# Google Calendar
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token

# Todoist
TODOIST_API_TOKEN=your_todoist_token

# Claude (Anthropic)
ANTHROPIC_API_KEY=your_anthropic_key

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
RECIPIENT_WHATSAPP=whatsapp:+32XXXXXXXXX

# Schedule
CRON_TIMEZONE=Europe/Brussels
CRON_SCHEDULE=0 18 * * 0

# Server
PORT=3000
API_SECRET=your_secret_for_manual_triggers
```

### Running

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

---

## API Endpoints

### `POST /trigger`

Manually trigger a prophecy (requires `Authorization: Bearer <API_SECRET>` header).

```bash
curl -X POST http://localhost:3000/trigger \
  -H "Authorization: Bearer your_secret"
```

### `GET /health`

Health check endpoint.

### `GET /status`

Returns current configuration and last prophecy info.

---

## Configuration Files

### `config.json` (Optional)

Override default Todoist filters:

```json
{
  "todoist": {
    "include_projects": ["Shared Life", "House", "Groceries"],
    "exclude_projects": ["Work", "Thoughtform", "Personal"],
    "min_priority": 2,
    "include_labels": ["share"],
    "include_overdue": true
  },
  "calendar": {
    "include_calendars": ["primary", "work"],
    "exclude_calendars": ["Holidays"],
    "days_ahead": 7
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SIBYL SYSTEM                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐     ┌──────────────┐                            │
│   │   Google     │     │   Todoist    │                            │
│   │   Calendar   │     │   API        │                            │
│   │   API        │     │   (filtered) │                            │
│   └──────┬───────┘     └──────┬───────┘                            │
│          │                    │                                     │
│          └────────┬───────────┘                                     │
│                   │                                                 │
│          ┌────────▼────────┐                                        │
│          │   AGGREGATOR    │  Combines data into structured format │
│          └────────┬────────┘                                        │
│                   │                                                 │
│          ┌────────▼────────┐                                        │
│          │   ORACLE        │  Claude generates message             │
│          │   (Claude API)  │  in Vince's voice                     │
│          └────────┬────────┘                                        │
│                   │                                                 │
│          ┌────────▼────────┐                                        │
│          │   MESSENGER     │  Twilio WhatsApp API                  │
│          └────────┬────────┘                                        │
│                   │                                                 │
│                   ▼                                                 │
│          📱 WhatsApp Message                                        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│   SCHEDULER: Cron job (Sunday evening) or manual trigger           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Voice

Sibyl speaks *as you*—not as an assistant, not as a formal summary. The message should feel like you typed it yourself, just more reliably.

**Tone:**
- Concise—every word earns its place
- Slight dry humor where natural
- Warm but not performative
- Direct—information first

**Example Output:**
> Week ahead: Keynote Thursday (evening thing, back by 9). Groceries are on me this week—list is mostly done. Saturday's clear if you want to do something. One annoying dentist appointment Wednesday morning.

---

## Project Structure

```
sibyl/
├── src/
│   ├── index.ts              # Main entry, API routes
│   ├── oracle/
│   │   ├── aggregator.ts     # Combine calendar + tasks
│   │   ├── generator.ts      # Claude API message gen
│   │   └── prompts.ts        # Prompt templates
│   ├── sources/
│   │   ├── calendar.ts       # Google Calendar API
│   │   └── todoist.ts        # Todoist API
│   ├── delivery/
│   │   └── whatsapp.ts       # Twilio integration
│   ├── scheduler/
│   │   └── cron.ts           # Scheduled runs
│   └── config/
│       └── schema.ts         # Config types
├── .env.example
├── package.json
└── README.md
```

---

## License

Private—for personal use.

---

*She sits at the threshold. She speaks what approaches. She carries word through the veil.*

