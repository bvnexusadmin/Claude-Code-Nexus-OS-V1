export const AGENTS = {
  CONVERSATION_MANAGER: "conversation_manager",
  LEAD_INTAKE: "lead_intake",
  QUALIFICATION: "qualification",
  BOOKING: "booking",
  FOLLOW_UP: "follow_up",
  REVIEW: "review",
  KNOWLEDGE: "knowledge",
} as const;

export type AgentName = typeof AGENTS[keyof typeof AGENTS];
