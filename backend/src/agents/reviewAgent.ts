// src/agents/reviewAgent.ts
// Phase 3 Review / Reputation Agent — decision-only.
// Detects reputation-sensitive messages (anger, threats, praise) and returns deterministic actions.
// No SMS sending. No external calls.

import { supabaseAdmin } from "../utils/supabaseAdmin.js";

export type ReviewActionType =
  | "no_action"
  | "escalate_to_human"
  | "request_review"
  | "apologize_and_escalate";

export type ReviewAgentInput = {
  client_id: string;
  lead_id: string;
  message: string;

  // Optional knobs
  enable_review_requests?: boolean; // default true
};

export type ReviewAgentResult = {
  ok: boolean;
  agent: "reviewAgent";
  action: ReviewActionType;
  client_id: string;
  lead_id: string;
  next_message?: string;
  reasons: string[];
  signals?: {
    sentiment: "negative" | "neutral" | "positive";
    contains_threat: boolean;
    contains_review_wording: boolean;
  };
};

export async function reviewAgent(
  input: ReviewAgentInput
): Promise<ReviewAgentResult> {
  const reasons: string[] = [];
  const msg = (input.message || "").trim();
  const text = msg.toLowerCase();

  const enableReviewRequests = input.enable_review_requests ?? true;

  const containsThreat = includesAny(text, [
    "lawsuit",
    "lawyer",
    "sue",
    "chargeback",
    "report you",
    "bbb",
    "attorney general",
    "fraud",
    "scam",
    "police",
    "im calling",
    "i'm calling",
  ]);

  const containsReviewWording = includesAny(text, [
    "review",
    "1 star",
    "one star",
    "2 star",
    "two star",
    "yelp",
    "google review",
    "facebook review",
    "post this",
    "blast you",
  ]);

  const negative = includesAny(text, [
    "angry",
    "mad",
    "pissed",
    "upset",
    "terrible",
    "horrible",
    "worst",
    "sucks",
    "trash",
    "ridiculous",
    "unacceptable",
    "never again",
    "waste of time",
  ]);

  const positive = includesAny(text, [
    "thanks",
    "thank you",
    "awesome",
    "great",
    "amazing",
    "perfect",
    "love it",
    "appreciate",
    "good job",
    "you guys are the best",
  ]);

  const sentiment: "negative" | "neutral" | "positive" = negative
    ? "negative"
    : positive
    ? "positive"
    : "neutral";

  // ---------------------------
  // Hard escalation conditions
  // ---------------------------
  if (containsThreat || containsReviewWording || sentiment === "negative") {
    if (containsThreat) reasons.push("threat_detected");
    if (containsReviewWording) reasons.push("review_threat_detected");
    if (sentiment === "negative") reasons.push("negative_sentiment_detected");

    const result: ReviewAgentResult = {
      ok: true,
      agent: "reviewAgent",
      action: containsThreat ? "apologize_and_escalate" : "escalate_to_human",
      client_id: input.client_id,
      lead_id: input.lead_id,
      next_message: containsThreat
        ? "I’m sorry this has been frustrating. A human will reach out shortly to help resolve this."
        : "I hear you. A human will follow up shortly to make this right.",
      reasons,
      signals: {
        sentiment,
        contains_threat: containsThreat,
        contains_review_wording: containsReviewWording,
      },
    };

    await logReviewDecision(result, msg);
    return result;
  }

  // ---------------------------
  // Review request (only when clearly positive)
  // ---------------------------
  if (enableReviewRequests && sentiment === "positive") {
    reasons.push("positive_sentiment_detected");

    const result: ReviewAgentResult = {
      ok: true,
      agent: "reviewAgent",
      action: "request_review",
      client_id: input.client_id,
      lead_id: input.lead_id,
      next_message:
        "Glad to hear that. If you have a moment, would you be willing to leave us a quick review?",
      reasons,
      signals: {
        sentiment,
        contains_threat: false,
        contains_review_wording: false,
      },
    };

    await logReviewDecision(result, msg);
    return result;
  }

  // ---------------------------
  // Default: no action
  // ---------------------------
  reasons.push("no_reputation_signal");

  const result: ReviewAgentResult = {
    ok: true,
    agent: "reviewAgent",
    action: "no_action",
    client_id: input.client_id,
    lead_id: input.lead_id,
    reasons,
    signals: {
      sentiment,
      contains_threat: false,
      contains_review_wording: false,
    },
  };

  await logReviewDecision(result, msg);
  return result;
}

/* ---------------- helpers ---------------- */

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((t) => text.includes(t));
}

async function logReviewDecision(result: ReviewAgentResult, rawMessage: string) {
  try {
    await supabaseAdmin.from("ai_actions").insert({
      client_id: result.client_id,
      agent_name: "reviewAgent",
      action_type: result.action,
      payload: {
        lead_id: result.lead_id,
        message: rawMessage,
        reasons: result.reasons,
        next_message: result.next_message ?? null,
        signals: result.signals ?? null,
        phase: "phase3",
      },
    });
  } catch (err: any) {
    console.error("❌ reviewAgent ai_actions insert failed:", err.message);
  }
}
