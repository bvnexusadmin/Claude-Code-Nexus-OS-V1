import type { AgentName } from "./agentNames.js";
import type { EventName } from "./events.js";

/**
 * Minimal tenant context expected by agents.
 * You already attach tenant context at req.ctx in Phase 2; this just types it.
 * Expand later without breaking contracts.
 */
export type TenantContext = {
  client: { id: string; name?: string };
  config?: Record<string, any>;
  integrations?: Record<string, any>;
  knowledgeDocs?: Array<{ id: string; title: string; content: string; tags?: any }>;
};

/**
 * The inbound “thing” the OS is reacting to.
 * For Phase 3 start: SMS.
 * Later: voice/web-form events can be added without breaking agent APIs.
 */
export type InboundEvent = {
  event: EventName;
  client_id: string;

  // Common identifiers
  lead_id?: string;
  message_id?: string;

  // SMS payload (Phase 3 start)
  channel?: "sms" | "voice" | "form";
  from?: string;
  to?: string;
  text?: string;

  // Raw provider payload (Twilio/Vapi/etc)
  raw?: any;

  received_at?: string;
};

export type AgentSideEffect =
  | "db:read"
  | "db:write"
  | "send:sms"
  | "calendar:write"
  | "emit:event"
  | "none";

export type AgentRunOptions = {
  /**
   * Strict mode enforces that agents only do what their contract says.
   * Keep true in dev.
   */
  strict?: boolean;
};

/**
 * Every agent must return a structured output.
 * Conversation Manager will use next_events to dispatch follow-on work.
 */
export type AgentResult<TOutput extends Record<string, any> = Record<string, any>> = {
  agent: AgentName;
  ok: boolean;

  lead_id?: string;
  booking_id?: string;

  output: TOutput;

  next_events?: Array<{
    event: EventName;
    payload?: Record<string, any>;
  }>;

  notes?: string; // short debug note (not user-facing)
};

export type AgentInput<TExtra extends Record<string, any> = Record<string, any>> = {
  ctx: TenantContext;
  inbound: InboundEvent;

  // Optional preloaded objects (fetched by Conversation Manager / dispatcher)
  lead?: Record<string, any>;
  messages?: Array<Record<string, any>>;

  extra?: TExtra;

  options?: AgentRunOptions;
};

export type Agent<TExtra extends Record<string, any>, TOutput extends Record<string, any>> = {
  name: AgentName;
  allowedSideEffects: AgentSideEffect[];

  run: (input: AgentInput<TExtra>) => Promise<AgentResult<TOutput>>;
};
