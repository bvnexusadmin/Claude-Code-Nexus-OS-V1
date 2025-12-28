// src/agents/conversationManager.ts

import { qualificationAgent } from "./qualificationAgent.js";

/**
 * Conversation Manager (Agent 7) — v1
 * Decision-only router.
 */
export function conversationManager(input: {
  client_id: string;
  event: {
    type: string;
    channel: string;
    occurred_at: string;
    raw?: Record<string, unknown>;
  };
  lead?: {
    id?: string;
    stage?: string;
    phone?: string | null;
  };
  recent_messages?: Array<{
    direction: "inbound" | "outbound";
    content: string;
  }>;
}) {
  try {
    const actions: any[] = [];

    if (!input.recent_messages || input.recent_messages.length === 0) {
      return {
        ok: true,
        agent: "conversationManager",
        client_id: input.client_id,
        data: {
          version: "v1",
          event_type: input.event.type,
          lead_id: input.lead?.id,
          actions: [],
          reasoning: {
            summary: "No messages to process",
          },
        },
      };
    }

    // ✅ FIX: only pass what the agent accepts
    const qualification = qualificationAgent({
      recent_messages: input.recent_messages,
    });

    if (qualification.status === "needs_info") {
      if (qualification.next_question) {
        actions.push({
          type: "QUEUE_MESSAGE",
          channel: "sms",
          to: input.lead?.phone,
          body: qualification.next_question,
          reason: "qualification_missing_info",
          lead_id: input.lead?.id,
        });
      }

      return {
        ok: true,
        agent: "conversationManager",
        client_id: input.client_id,
        lead_id: input.lead?.id,
        data: {
          version: "v1",
          event_type: input.event.type,
          lead_id: input.lead?.id,
          actions,
          reasoning: {
            summary: "Lead requires additional qualification",
            signals: qualification,
          },
        },
      };
    }

    if (qualification.status === "qualified") {
      actions.push({
        type: "SET_STAGE",
        stage: "booking",
        reason: "lead_qualified",
      });

      actions.push({
        type: "CALL_AGENT",
        agent: "booking",
        reason: "lead qualified, proceed to booking",
        input: {},
      });

      return {
        ok: true,
        agent: "conversationManager",
        client_id: input.client_id,
        lead_id: input.lead?.id,
        data: {
          version: "v1",
          event_type: input.event.type,
          lead_id: input.lead?.id,
          actions,
          reasoning: {
            summary: "Lead qualified, routing to booking",
            signals: qualification,
          },
        },
      };
    }

    return {
      ok: true,
      agent: "conversationManager",
      client_id: input.client_id,
      lead_id: input.lead?.id,
      data: {
        version: "v1",
        event_type: input.event.type,
        lead_id: input.lead?.id,
        actions: [],
        reasoning: {
          summary: "Lead unqualified",
          signals: qualification,
        },
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      agent: "conversationManager",
      client_id: input.client_id,
      error: {
        code: "CONVERSATION_MANAGER_ERROR",
        message: err?.message ?? "Unknown error",
      },
    };
  }
}
