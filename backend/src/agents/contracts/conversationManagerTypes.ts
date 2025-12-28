// src/agents/contracts/qualificationAgentTypes.ts

export type QualificationSignal =
  | "service_type"
  | "location"
  | "timeline"
  | "unknown";

export type QualificationExtracted = {
  service_type?: string;
  urgency?: "low" | "medium" | "high";
  timeline?: string;
  location?: string;
};

export type QualificationReasoning = {
  summary: string;
  confidence: number; // 0..1
};

export type QualificationResult =
  | {
      status: "qualified";
      extracted: QualificationExtracted;
      reasoning: QualificationReasoning;
    }
  | {
      status: "needs_info";
      extracted: QualificationExtracted;
      missing: QualificationSignal[];
      next_question?: string;
      reasoning: QualificationReasoning;
    }
  | {
      status: "unqualified";
      missing: QualificationSignal[];
      reasoning: QualificationReasoning;
    };

export type QualificationAgentInput = {
  recent_messages: Array<{
    direction: "inbound" | "outbound";
    content: string;
  }>;
};
