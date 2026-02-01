import type { SystemEvent } from "../../agents/contracts/systemEvents.js";
import { conversationManager } from "../../agents/conversationManager.js";
import { executeVoiceMessage } from "../voice/voiceExecutor.js";
import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

/**
 * Dispatches system events into Conversation Manager,
 * then persists + executes resulting actions.
 *
 * This file is EXECUTION ONLY.
 */
export async function dispatchEvent(event: SystemEvent) {
  console.log("🟢 DISPATCH EVENT RECEIVED", {
    event_type: event.event_type,
    client_id: event.client_id,
    payload: event.payload,
  });

  const result = await conversationManager({
    client_id: event.client_id,
    event: {
      type: event.event_type,
      channel: "system",
      occurred_at: new Date().toISOString(),
      payload: event.payload,
    },
    recent_messages: [],
  });

  console.log("🟡 CONVERSATION MANAGER RESULT", JSON.stringify(result, null, 2));

  const actions = result?.data?.actions ?? [];
  console.log("🔵 ACTION COUNT", actions.length);

  for (const action of actions) {
    console.log("➡️ ACTION", action);

    if (action.type === "QUEUE_MESSAGE") {
      const { error } = await supabaseAdmin.from("messages").insert({
        client_id: event.client_id,
        lead_id: action.lead_id ?? null,

        channel: action.channel,              // sms
        direction: "outbound",
        sender_type: "system",                // 🔥 REQUIRED
        topic: action.reason ?? "system",
        content: action.body,

        source: "system",
        raw_payload: {
          event_type: event.event_type,
          booking_id: event.payload?.booking_id,
        },
      });

      if (error) {
        console.error("❌ MESSAGE INSERT FAILED", error);
      } else {
        console.log("✅ MESSAGE INSERTED");
      }
    }

    if (action.type === "QUEUE_MESSAGE" && action.channel === "voice") {
      await executeVoiceMessage({
        client_id: event.client_id,
        call_id: action.external_id,
        text: action.body,
      });
    }
  }

  return result;
}
