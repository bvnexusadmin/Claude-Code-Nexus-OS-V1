// src/agents/followUpAgent.ts
// Phase 3 Follow-Up Agent with hard cap

import { supabaseAdmin } from "../utils/supabaseAdmin.js";

const MAX_FOLLOW_UPS = 3;

export async function followUpAgent(input: {
  client_id: string;
  lead_id: string;
  last_outbound_at?: string;
  conversation_stage?: string;
}) {
  // Count previous follow-ups
  const { count } = await supabaseAdmin
    .from("ai_actions")
    .select("*", { count: "exact", head: true })
    .eq("client_id", input.client_id)
    .eq("lead_id", input.lead_id)
    .eq("agent_name", "followUpAgent")
    .eq("action_type", "send_follow_up");

  if ((count ?? 0) >= MAX_FOLLOW_UPS) {
    return {
      ok: true,
      agent: "followUpAgent",
      action: "no_action",
      reasons: ["follow_up_cap_reached"],
    };
  }

  if (input.conversation_stage === "confirmed" || input.conversation_stage === "closed") {
    return {
      ok: true,
      agent: "followUpAgent",
      action: "no_action",
      reasons: ["conversation_complete"],
    };
  }

  return {
    ok: true,
    agent: "followUpAgent",
    action: "send_follow_up",
    next_message: "Just checking in — let me know if you’d like to move forward.",
    reasons: ["lead_stalled"],
  };
}
