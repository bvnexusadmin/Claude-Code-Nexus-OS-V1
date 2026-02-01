// src/agents/contracts/conversationState.ts

export type ConversationState =
  | "new"
  | "qualifying"
  | "booking"
  | "awaiting_slot_pick"
  | "confirmed"
  | "stalled"
  | "escalated"
  | "closed";

export const ALLOWED_STATE_TRANSITIONS: Record<
  ConversationState,
  ConversationState[]
> = {
  new: ["qualifying"],
  qualifying: ["booking", "closed"],
  booking: ["awaiting_slot_pick", "confirmed", "stalled"],
  awaiting_slot_pick: ["confirmed", "stalled"],
  confirmed: ["closed"],
  stalled: ["booking", "escalated", "closed"],
  escalated: ["closed"],
  closed: [],
};

export function isValidTransition(
  from: ConversationState,
  to: ConversationState
): boolean {
  return ALLOWED_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
