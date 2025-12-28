// src/agents/contracts/qualificationAgentTypes.ts

export type QualificationSignal =
  | "service_type"
  | "location"
  | "timeline"
  | "unknown";

export type QualificationExtracted = {
  service_type?: string | undefined;
  urgency?: "low" | "medium" | "high" | undefined;
  timeline?: string | undefined;
  location?: string | undefined;
};

export type QualificationReasoning = {
  summary: string;
  confidence: number;
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
      next_question?: string | undefined;
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
