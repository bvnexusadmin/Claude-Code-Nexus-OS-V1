// src/agents/contracts/systemEvents.ts

/* ------------------------------------------------------------------
 * SYSTEM EVENT NAMES (DO NOT BREAK EXISTING IMPORTS)
 * ------------------------------------------------------------------ */

export const SYSTEM_EVENTS = {
  MESSAGE_RECEIVED: "message.received",

  LEAD_INTAKE_COMPLETED: "lead.intake.completed",
  LEAD_QUALIFIED: "lead.qualified",

  KNOWLEDGE_REQUESTED: "knowledge.requested",
  BOOKING_REQUESTED: "booking.requested",
  FOLLOWUP_REQUESTED: "followup.requested",

  HANDOFF_REQUIRED: "handoff.required",
  BOOKING_CONFIRMED: "booking.confirmed",
} as const;

export type SystemEventType =
  typeof SYSTEM_EVENTS[keyof typeof SYSTEM_EVENTS];

/* ------------------------------------------------------------------
 * CANONICAL EVENT ENVELOPE (NEW — THIS IS THE LAW)
 * ------------------------------------------------------------------ */

export type EventSource = "sms" | "call" | "form" | "system";

export interface SystemEvent {
  event_id: string;          // uuid
  event_type: SystemEventType;
  client_id: string;
  lead_id?: string;
  source: EventSource;
  occurred_at: string;       // ISO string
  trace_id: string;          // uuid per inbound interaction
  payload: Record<string, any>;
}
