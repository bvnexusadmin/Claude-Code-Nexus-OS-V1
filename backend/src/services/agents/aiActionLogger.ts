import { supabaseAdmin } from "../../utils/supabaseAdmin.js";

/**
 * aiActionLogger
 *
 * Records every meaningful agent action in ai_actions.
 * This is the system's audit + billing backbone.
 */
export async function logAiAction({
  trace_id,
  event_id,
  client_id,
  lead_id,
  agent,
  action_type,
  payload,
}: {
  trace_id: string;
  event_id: string;
  client_id: string;
  lead_id?: string;
  agent: string;
  action_type: string;
  payload?: Record<string, any>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_actions").insert({
    trace_id,
    event_id,
    client_id,
    lead_id,
    agent,
    action_type,
    payload: payload ?? {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[aiActionLogger] Failed to log action:", error);
  }
}
