export const EVENTS = {
  MESSAGE_RECEIVED: "message.received",

  LEAD_INTAKE_COMPLETED: "lead.intake.completed",
  LEAD_QUALIFIED: "lead.qualified",

  BOOKING_REQUESTED: "booking.requested",
  BOOKING_CONFIRMED: "booking.confirmed",

  FOLLOWUP_REQUESTED: "followup.requested",
  KNOWLEDGE_REQUESTED: "knowledge.requested",

  HANDOFF_REQUIRED: "handoff.required",
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
