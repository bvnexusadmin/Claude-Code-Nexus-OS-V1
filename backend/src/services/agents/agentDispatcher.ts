// src/services/agents/agentDispatcher.ts

import type { SystemEvent } from "../../agents/contracts/systemEvents.js";
import { conversationManager } from "../../agents/conversationManager.js";

/**
 * Dispatches system events to Agent 7
 * This file TRANSLATES SystemEvent → ConversationManager input.
 */
export async function dispatchEvent(event: SystemEvent) {
  return conversationManager({
    client_id: event.client_id,

    event: {
      type: "system.event",
      channel: "system",
      occurred_at: new Date().toISOString(),
      raw: event.payload,
    },

    // System events usually have no messages
    recent_messages: [],
  });
}
