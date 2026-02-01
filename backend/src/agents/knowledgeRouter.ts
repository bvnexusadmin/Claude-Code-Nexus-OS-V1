// src/agents/knowledgeRouter.ts
// Phase 3 Knowledge Router — deterministic only.
// NO LLM. NO external calls. Decision-only.

export type KnowledgeRouteAction =
  | "knowledge_answerable"
  | "booking_related"
  | "needs_human"
  | "not_knowledge";

export type KnowledgeRouterResult = {
  ok: boolean;
  agent: "knowledgeRouter";
  action: KnowledgeRouteAction;
  reasons: string[];
};

export function knowledgeRouter(input: {
  message: string;
}): KnowledgeRouterResult {
  const text = (input.message || "").toLowerCase().trim();
  const reasons: string[] = [];

  if (!text) {
    return {
      ok: true,
      agent: "knowledgeRouter",
      action: "not_knowledge",
      reasons: ["empty_message"],
    };
  }

  // -----------------------------------
  // Booking-related questions
  // -----------------------------------
  if (
    includesAny(text, [
      "book",
      "booking",
      "schedule",
      "appointment",
      "available",
      "availability",
      "time",
      "when can",
      "reschedule",
    ])
  ) {
    reasons.push("booking_keyword_detected");
    return {
      ok: true,
      agent: "knowledgeRouter",
      action: "booking_related",
      reasons,
    };
  }

  // -----------------------------------
  // Human escalation signals
  // -----------------------------------
  if (
    includesAny(text, [
      "talk to a human",
      "real person",
      "call me",
      "manager",
      "complaint",
      "this is wrong",
    ])
  ) {
    reasons.push("human_request_detected");
    return {
      ok: true,
      agent: "knowledgeRouter",
      action: "needs_human",
      reasons,
    };
  }

  // -----------------------------------
  // Knowledge / FAQ signals
  // -----------------------------------
  if (
    includesAny(text, [
      "price",
      "pricing",
      "cost",
      "how much",
      "hours",
      "open",
      "close",
      "location",
      "address",
      "services",
      "do you",
      "can you",
      "what is",
      "how does",
      "policy",
      "refund",
    ])
  ) {
    reasons.push("knowledge_keyword_detected");
    return {
      ok: true,
      agent: "knowledgeRouter",
      action: "knowledge_answerable",
      reasons,
    };
  }

  // -----------------------------------
  // Default fallback
  // -----------------------------------
  reasons.push("no_knowledge_match");
  return {
    ok: true,
    agent: "knowledgeRouter",
    action: "not_knowledge",
    reasons,
  };
}

/* ---------------- helpers ---------------- */

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((t) => text.includes(t));
}
