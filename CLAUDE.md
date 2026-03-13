# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nexus OS is an AI-powered lead management and booking system. It ingests inbound leads via SMS, voice, and email; qualifies them through multi-agent AI logic; books appointments via Google Calendar; and provides a management dashboard.

## Commands

### Backend (`/backend`)
```bash
npm run dev        # Start dev server with hot reload (tsx watch)
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled production server
npm run typecheck  # Type-check without emitting
```

### Frontend (`/frontend`)
```bash
npm start          # Dev server at localhost:3000
npm run build      # Production build
npm test           # Run Jest tests
```

### Automation (`/automation/n8n`)
```bash
docker-compose up  # Start N8N at localhost:5678
```

Backend runs on port 4000. Frontend proxies API calls to it.

## Architecture

### Event-Driven Agent System

The backend uses a publish/subscribe event bus (`src/services/events/`) to coordinate agents. The flow is:

1. **Webhook** (SMS/Voice/Email) receives inbound message
2. **ConversationManager** (`src/agents/conversationManager.ts`) dispatches events
3. **Specialized Agents** process events and emit new ones
4. **Executors** (`src/services/execution/`) carry out plans (send SMS, book calendar slot, etc.)

Key events defined in `src/agents/contracts/events.ts`:
- `message.received` → `lead.intake.completed` → `lead.qualified` → `booking.requested` → `booking.confirmed`
- `followup.requested`, `knowledge.requested`, `handoff.required`

### Conversation State Machine

Lead lifecycle (`src/agents/contracts/conversationState.ts`):
```
new → qualifying → booking → awaiting_slot_pick → confirmed → closed
                ↓
           stalled → escalated → closed
```

### Agent Roles

| Agent | File | Responsibility |
|---|---|---|
| ConversationManager | `agents/conversationManager.ts` | Event routing and orchestration |
| LeadIntakeAgent | `agents/leadIntakeAgent.ts` | Extracts phone, name, issue from messages |
| QualificationAgent | `agents/qualificationAgent.ts` | Pure decision logic (service type, urgency, location) |
| BookingAgent | `agents/bookingAgent.ts` | Manages calendar slots and confirmations |
| FollowUpAgent | `agents/followUpAgent.ts` | Schedules reminders |
| KnowledgeAgent | `agents/knowledgeAgent.ts` | FAQ/knowledge retrieval by tags |
| ReviewAgent | `agents/reviewAgent.ts` | Quality review |

Agent execution is coordinated by `src/services/agents/agentDispatcher.ts`.

### Multi-Tenancy

Currently single-tenant with a hardcoded client ID (`62137f9b-b1eb-4213-9423-f5715d3b9615`). The intent is to resolve tenant by Twilio MessagingServiceSid/To number. Tenant context is loaded via `src/middleware/loadTenantContext.ts` and available as `req.ctx.client`.

### Webhooks

| Channel | Route | Format |
|---|---|---|
| SMS (Twilio) | `POST /webhooks/sms` | form-encoded |
| Voice (Vapi) | `POST /webhooks/vapi` | JSON |
| Email (Postmark) | `POST /webhooks/email` | JSON |
| Automation (N8N) | `POST /webhooks/automation` | JSON |

### Key Integrations

- **Database/Auth**: Supabase (PostgreSQL + Auth)
  - Admin client: `src/utils/supabaseAdmin.ts`
  - User-scoped client: `src/utils/supabaseUser.ts`
- **SMS**: Twilio (`src/services/messaging/`)
- **Voice**: Vapi (`src/services/voice/`)
- **Email**: Postmark (`src/services/messaging/`)
- **Calendar**: Google Calendar API (`src/services/calendar/`)
- **LLM**: OpenAI GPT (`src/services/llm/`)

### Frontend

React SPA using Supabase Auth. Routes defined in `frontend/src/App.tsx`. API calls go through `frontend/src/lib/api.ts` (HTTP client with JWT auth). Tenant context provided via `frontend/src/lib/tenant.tsx`.

Key pages: Dashboard, Inbox, Conversation, Leads, LeadProfile, Bookings, Settings.

## TypeScript Configuration

Backend uses strict TypeScript with `moduleResolution: nodenext` and `module: nodenext`. Use `.js` extensions in import paths (required by nodenext resolution even for `.ts` source files). Validation uses Zod schemas throughout.

## Required Environment Variables

Backend requires a `.env` file (not in repo). Validated at startup in `src/config/env.ts`. Essential keys:
- `OPENAI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `NEXUS_WEBHOOK_SECRET`
- Plus credentials for Twilio, Vapi, Postmark, Google OAuth/Calendar
