// src/agents/qualificationAgent.ts

import type {
  QualificationAgentInput,
  QualificationResult,
  QualificationSignal,
  QualificationExtracted,
} from "./contracts/qualificationAgentTypes.js";

/**
 * Qualification Agent (Agent 2)
 * PURE DECISION AGENT (v1)
 */

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function lastInboundText(input: QualificationAgentInput): string {
  const inbound = [...input.recent_messages]
    .reverse()
    .find((m) => m.direction === "inbound");

  return inbound?.content ?? "";
}

function isGarbage(text: string): boolean {
  if (!text) return true;
  if (text.length < 2) return true;
  if (/(asdf|qwerty|lorem ipsum|test test)/i.test(text)) return true;
  return false;
}

/* ------------------------- extraction ------------------------- */

function extractServiceType(text: string): string | undefined {
  const t = normalize(text);

  const services: Array<[RegExp, string]> = [
    [/plumb|leak|pipe|toilet|sink|drain/i, "plumbing"],
    [/hvac|a\/c|air condition|furnace|heat/i, "hvac"],
    [/electric|outlet|breaker|panel|wire/i, "electrical"],
    [/roof|shingle|roof leak/i, "roofing"],
    [/clean|maid|deep clean/i, "cleaning"],
    [/landscap|lawn|sprinkler|mow/i, "landscaping"],
  ];

  for (const [re, label] of services) {
    if (re.test(t)) return label;
  }

  return undefined;
}

function extractUrgency(text: string): "low" | "medium" | "high" | undefined {
  const t = normalize(text);

  if (/(asap|urgent|emergency|right now|today)/i.test(t)) return "high";
  if (/(soon|tomorrow|this week)/i.test(t)) return "medium";
  if (/(next week|no rush|whenever)/i.test(t)) return "low";

  return undefined;
}

function extractTimeline(text: string): string | undefined {
  const patterns = [
    /today/i,
    /tomorrow/i,
    /this week/i,
    /next week/i,
    /this weekend/i,
    /asap/i,
    /no rush/i,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[0]) return match[0];
  }

  return undefined;
}

function extractLocation(text: string): string | undefined {
  const match = text.match(/\b(in|near)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i);
  if (!match) return undefined;

  const loc = match[2]?.trim();
  if (!loc) return undefined;
  if (/(morning|afternoon|evening|night)/i.test(loc)) return undefined;

  return loc;
}

/* ------------------------- decision helpers ------------------------- */

function findMissing(extracted: QualificationExtracted): QualificationSignal[] {
  const missing: QualificationSignal[] = [];

  if (!extracted.service_type) missing.push("service_type");
  if (!extracted.location) missing.push("location");
  if (!extracted.urgency && !extracted.timeline) missing.push("timeline");

  return missing;
}

function nextQuestion(missing: QualificationSignal[]): string | undefined {
  if (missing.includes("service_type"))
    return "What service do you need help with?";
  if (missing.includes("timeline"))
    return "When are you hoping to get this taken care of?";
  if (missing.includes("location"))
    return "What city or area are you located in?";
  return undefined;
}

/* ------------------------- agent ------------------------- */

export function qualificationAgent(
  input: QualificationAgentInput
): QualificationResult {
  const text = lastInboundText(input);

  if (isGarbage(text)) {
    return {
      status: "unqualified",
      missing: ["unknown"],
      reasoning: {
        summary: "Message is empty or nonsensical",
        confidence: 0.9,
      },
    };
  }

  const extracted: QualificationExtracted = {
    service_type: extractServiceType(text),
    urgency: extractUrgency(text),
    timeline: extractTimeline(text),
    location: extractLocation(text),
  };

  const missing = findMissing(extracted);

  const qualified =
    !!extracted.service_type &&
    !!extracted.location &&
    (!!extracted.urgency || !!extracted.timeline);

  if (qualified) {
    return {
      status: "qualified",
      extracted,
      reasoning: {
        summary: "Lead has sufficient info to proceed",
        confidence: 0.75,
      },
    };
  }

  return {
    status: "needs_info",
    extracted,
    missing,
    next_question: nextQuestion(missing),
    reasoning: {
      summary: "Lead needs additional info",
      confidence: 0.65,
    },
  };
}
