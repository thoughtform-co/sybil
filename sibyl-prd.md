# SIBYL — Product Requirements Document

> *She sits where your intentions gather and gives them voice before they're lost to silence.*

---

## I. Vision

**Sibyl** is an oracle for the domestic mundane—a herald that scries calendars and task lists, then carries word through the veil to those who need to know.

The problem: Vince captures intentions (calendar events, Todoist tasks) but fails to communicate them to his girlfriend. Not from secrecy—from friction. The information exists; the bridge doesn't.

Sibyl is the bridge.

### What Sibyl Does

1. **Reads** Google Calendar events and filtered Todoist tasks
2. **Synthesizes** them into a concise, human message in Vince's voice
3. **Delivers** via WhatsApp on a scheduled cadence

### What Sibyl Doesn't Do

- Manage tasks or calendars (read-only oracle)
- Respond to messages (one-way herald)
- Replace communication (augment it)

---

## II. Architecture Overview

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

## III. Data Sources

### A. Google Calendar Integration

**API:** Google Calendar API v3  
**Auth:** OAuth 2.0 (service account or user consent flow)  
**Scope:** `https://www.googleapis.com/auth/calendar.readonly`

**Data to Extract:**
| Field | Purpose |
|-------|---------|
| `summary` | Event title |
| `start.dateTime` | When it happens |
| `end.dateTime` | Duration context |
| `location` | If relevant (keynotes, meetings) |
| `description` | Additional context (optional, for flagged events) |

**Filters:**
- Time range: Next 7 days from trigger time
- Calendars: Configurable list (e.g., "Work", "Personal", exclude "Holidays")
- All-day events: Include (likely important—travel, deadlines)

### B. Todoist Integration

**API:** Todoist REST API v2  
**Auth:** API token (personal access token)  
**Endpoint:** `https://api.todoist.com/rest/v2/tasks`

**Data to Extract:**
| Field | Purpose |
|-------|---------|
| `content` | Task description |
| `due.date` | When it's due |
| `priority` | P1-P4 (filter high priority) |
| `project_id` | Filter by relevant projects |
| `labels` | Optional secondary filter |

**Filters (Critical):**
- **Projects:** Whitelist specific projects only
  - Example: "Shared Life", "House", "Relationship" → Include
  - Example: "Work", "Thoughtform" → Exclude (not relevant to her)
- **Priority:** Include P1 and P2 only (or configurable)
- **Due date:** Next 7 days + overdue items
- **Labels:** Optional—could use a "share" label for explicit inclusion

**Configuration Object:**
```json
{
  "todoist": {
    "include_projects": ["Shared Life", "House", "Groceries"],
    "exclude_projects": ["Work", "Thoughtform", "Personal"],
    "min_priority": 2,
    "include_labels": ["share"],
    "include_overdue": true
  }
}
```

---

## IV. Oracle Engine (Message Generation)

### Voice Definition

Sibyl speaks *as Vince*—not as an assistant, not as a formal summary. The message should feel like Vince typed it himself, just more reliably.

**Tone Parameters:**
- **Concise:** No fluff, no "Hope you're having a great day!"
- **Slight humor:** Dry, observational, not forced
- **Warm but not saccharine:** Care without performance
- **Direct:** Information first, framing second

**Example Good Output:**
> Week ahead: Keynote Thursday (evening thing, back by 9). Groceries are on me this week—list is mostly done. Saturday's clear if you want to do something. One annoying dentist appointment Wednesday morning.

**Example Bad Output:**
> Hi babe! 🌟 Here's what's coming up for us this week! I have a super exciting keynote on Thursday evening—so proud of this one! Also don't forget we need groceries teehee 🛒

### Prompt Template (Claude API)

```
You are generating a WhatsApp message from Vince to his girlfriend about his upcoming week. 

VOICE GUIDELINES:
- Concise. Every word earns its place.
- Slight dry humor where natural, never forced.
- Warm but not performative. Care without cheese.
- Direct. Information first.
- No emojis unless they add genuine meaning.
- No greetings like "Hi babe!" or "Hey love!" — just start with the content.
- Maximum 4-6 sentences. Shorter is better.

CALENDAR EVENTS (next 7 days):
{calendar_events}

TASKS (filtered, next 7 days):
{tasks}

Generate a single WhatsApp message that:
1. Highlights the most important 2-3 things she'd want to know
2. Mentions anything that affects shared time
3. Calls out anything she might want to plan around
4. Skips anything boring or irrelevant to her

If there's genuinely nothing notable, say something like "Pretty quiet week actually. No major commitments."
```

---

## V. Delivery System

### WhatsApp via Twilio

**API:** Twilio WhatsApp Business API  
**Auth:** Account SID + Auth Token  
**Endpoint:** Messages resource

**Setup Requirements:**
1. Twilio account with WhatsApp sandbox or approved sender
2. Recipient phone number verified (girlfriend's number)
3. Message templates approved (if using business API)

**Message Format:**
- Plain text (WhatsApp handles formatting)
- Max ~1600 characters (WhatsApp limit)
- No media attachments (text oracle only)

**Fallback:** If Twilio fails, log message and alert Vince (email/Slack)

---

## VI. Scheduling & Triggers

### Primary: Weekly Cron

**Timing:** Sunday evening, 18:00 CET  
**Rationale:** Start of week planning, before Monday chaos

**Cron Expression:** `0 18 * * 0`

### Secondary: Manual Trigger

**Method:** HTTP endpoint (authenticated)  
**Use case:** Ad-hoc updates, testing, "send now" button in dashboard

### Optional Future: Event-Driven

- Trigger on calendar changes (Google Calendar push notifications)
- Trigger on high-priority task creation
- *Not in V1—keep it simple*

---

## VII. Configuration Dashboard (UI)

A minimal web interface for managing Sibyl's configuration.

### Design Identity: The Temple Console

Sibyl's interface exists within the Thoughtform universe but draws from Greek oracle traditions—Delphi's temple meets NASA mission control.

**Visual Differentiation from Astrolabe:**
| Element | Astrolabe | Sibyl |
|---------|-----------|-------|
| Accent | Pure Gold | Gold + Terracotta `#C17F59` |
| Particle behavior | Flowing vectors | Rising smoke/incense |
| Border ornament | ASCII markers | Greek key patterns |
| Body font | IBM Plex Sans | Crimson Pro (classical) |
| Character | Brass sextant | Temple tripod |

### Color Tokens (Sibyl-Specific)

```css
:root {
  /* Inherit Thoughtform base */
  --void: #050403;
  --surface-0: #0A0908;
  --surface-1: #0F0E0C;
  --dawn: #ECE3D6;
  
  /* Sibyl accent: warm terracotta (oracle flame) */
  --sibyl-flame: #C17F59;
  --sibyl-flame-bright: #D4926B;
  --sibyl-flame-40: rgba(193, 127, 89, 0.40);
  --sibyl-flame-15: rgba(193, 127, 89, 0.15);
  
  /* Gold as secondary */
  --gold: #CAA554;
}
```

### Dashboard Sections

```
┌─────────────────────────────────────────────────────────────────────┐
│  ◯ SIBYL                                           [SEND NOW]      │
│  Oracle Status: ● Listening                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  // SCHEDULE                                                        │
│  ├─ Cadence: Weekly                                                │
│  ├─ Day: Sunday                                                    │
│  ├─ Time: 18:00 CET                                                │
│  └─ Next prophecy: Sunday, 15 Dec 2024                             │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  // CALENDAR SOURCES                                                │
│  ├─ ✓ Work Calendar                                                │
│  ├─ ✓ Personal                                                     │
│  └─ ○ Holidays (excluded)                                          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  // TODOIST PROJECTS                                                │
│  ├─ ✓ Shared Life                                                  │
│  ├─ ✓ House                                                        │
│  ├─ ✓ Groceries                                                    │
│  ├─ ○ Work (excluded)                                              │
│  └─ ○ Thoughtform (excluded)                                       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  // LAST PROPHECY                                     [View Full]  │
│  ├─ Sent: Sunday, 8 Dec 2024, 18:00                                │
│  └─ "Pretty packed week. Keynote Thursday evening..."              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  // RECIPIENT                                                       │
│  └─ +32 XXX XX XX XX (WhatsApp verified ✓)                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Particle System: Rising Smoke

Unlike Astrolabe's flowing vectors, Sibyl's particles rise like incense from a bronze tripod:

```javascript
// Sibyl particle behavior
const PARTICLE_CONFIG = {
  direction: 'up',           // Always rising
  drift: 0.3,                // Slight horizontal wander
  fadeRate: 0.02,            // Slow dissolve
  spawnPoint: 'bottom',      // Rise from below
  color: SIBYL_FLAME,        // Terracotta glow
  trailOpacity: 0.05         // Subtle smoke trails
};
```

### Greek Key Border

Instead of ASCII box-drawing, Sibyl uses a simplified Greek key pattern for section dividers:

```css
.sibyl-divider {
  height: 1px;
  background: 
    repeating-linear-gradient(
      90deg,
      var(--sibyl-flame-40) 0px,
      var(--sibyl-flame-40) 8px,
      transparent 8px,
      transparent 12px,
      var(--sibyl-flame-40) 12px,
      var(--sibyl-flame-40) 16px,
      transparent 16px,
      transparent 24px
    );
}
```

---

## VIII. Technical Implementation

### Stack Recommendation

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js / Bun | Good API support, familiar |
| Framework | Hono or Express | Lightweight API server |
| Scheduler | node-cron or external (Railway cron) | Simple, reliable |
| Database | SQLite / Turso | Config storage, message log |
| Hosting | Railway / Vercel | Easy deploy, cron support |
| Dashboard | React + Vite | Thoughtform-compatible |

### File Structure

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
├── dashboard/                 # React dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── styles/
│   └── index.html
├── .env.example
├── package.json
└── README.md
```

### Environment Variables

```bash
# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Todoist
TODOIST_API_TOKEN=

# Claude
ANTHROPIC_API_KEY=

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
RECIPIENT_WHATSAPP=whatsapp:+32XXXXXXXXX

# Schedule
CRON_TIMEZONE=Europe/Brussels
```

---

## IX. MVP Scope

### V1: The Minimal Oracle

**Must Have:**
- [ ] Google Calendar read (single calendar, 7 days)
- [ ] Todoist read (filtered by 2-3 projects)
- [ ] Claude message generation (basic prompt)
- [ ] WhatsApp delivery via Twilio
- [ ] Weekly cron trigger (Sunday 18:00)
- [ ] Manual trigger endpoint
- [ ] Basic logging (what was sent, when)

**Won't Have (V1):**
- Dashboard UI (configure via .env)
- Multiple recipients
- Dynamic schedule changes
- Event-driven triggers
- Message history/archive UI
- Read receipts or responses

### V2: The Temple Console

- Configuration dashboard
- Visual message preview
- Delivery status tracking
- Project/calendar toggle UI
- Message history view

### V3: The Responsive Oracle

- Event-driven triggers
- Two-way conversation (she can ask Sibyl questions)
- Multiple schedule options
- Shared calendar integration

---

## X. Success Metrics

**Primary:** Does his girlfriend feel more informed about his week?

**Measurable Proxies:**
- Messages actually sent (delivery rate)
- Fewer "why didn't you tell me about X" friction moments
- She finds the tone/content appropriate (qualitative)

**Anti-Metrics:**
- Message feels robotic or impersonal → voice tuning
- Too much irrelevant info → filter tuning
- Too little info → expand sources

---

## XI. Open Questions

1. **Shared vs. Solo Calendar:** Does she want *her* events reflected too? (V1: No, keep it one-way)

2. **Acknowledgment:** Should Sibyl expect/track read receipts? (V1: No, fire and forget)

3. **Override Content:** Should Vince be able to inject manual notes? ("Also, don't forget mom's birthday")

4. **Failure Mode:** If APIs fail, send partial? Send nothing? Send error message?

5. **Privacy:** How to handle sensitive calendar entries? (Default: include all, trust filter config)

---

*She sits at the threshold. She speaks what approaches. She carries word through the veil.*

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
