// src/agents/contracts/agentResult.ts

export type AgentActionType =
  | "qualify"
  | "answer"
  | "propose_times"
  | "book"
  | "follow_up"
  | "request_review"
  | "escalate"
  | "noop";

export type AgentChannel = "sms" | "email";

export type AgentOutboundMessage = {
  channel: AgentChannel;
  body: string;
  metadata?: Record<string, unknown>;
};

export type AgentDbUpdate = {
  table: "leads" | "bookings" | "messages" | "ai_actions";
  where: Record<string, unknown>;
  patch: Record<string, unknown>;
};

export type AgentEmitEvent = {
  name: string;
  payload?: Record<string, unknown>;
};

export type AgentResult = {
  agent_name: string;
  action_type: AgentActionType;

  confidence: number; // 0–1
  requires_human: boolean;
  reasoning: string;

  messages: AgentOutboundMessage[];

  db_updates?: AgentDbUpdate[];
  events_to_emit?: AgentEmitEvent[];

  next_agent?: string;
};
